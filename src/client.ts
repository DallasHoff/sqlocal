import { nanoid } from 'nanoid';
import type {
	CallbackUserFunction,
	ConfigMessage,
	DestroyMessage,
	FunctionMessage,
	ImportMessage,
	OmitQueryKey,
	OutputMessage,
	QueryKey,
	QueryMessage,
	Sqlite3Method,
	TransactionMessage,
} from './types';

export class SQLocal {
	protected databasePath: string;
	protected worker: Worker;
	protected isWorkerDestroyed: boolean = false;
	protected userCallbacks = new Map<string, CallbackUserFunction['handler']>();
	protected queriesInProgress = new Map<
		QueryKey,
		[
			resolve: (message: OutputMessage) => void,
			reject: (error: unknown) => void,
		]
	>();

	constructor(databasePath: string) {
		this.worker = new Worker(new URL('./worker', import.meta.url), {
			type: 'module',
		});
		this.worker.addEventListener('message', this.processMessageEvent);

		this.databasePath = databasePath;
		this.worker.postMessage({
			type: 'config',
			key: 'databasePath',
			value: databasePath,
		} satisfies ConfigMessage);
	}

	protected processMessageEvent = (event: MessageEvent<OutputMessage>) => {
		const message = event.data;
		const queries = this.queriesInProgress;

		switch (message.type) {
			case 'success':
			case 'data':
			case 'error':
				if (message.queryKey && queries.has(message.queryKey)) {
					const [resolve, reject] = queries.get(message.queryKey)!;
					if (message.type === 'error') {
						reject(message.error);
					} else {
						resolve(message);
					}
					queries.delete(message.queryKey);
				} else if (message.type === 'error') {
					throw message.error;
				}
				break;

			case 'callback':
				const userCallback = this.userCallbacks.get(message.name);

				if (userCallback) {
					userCallback(...(message.args ?? []));
				}
				break;
		}
	};

	protected createQuery = (
		message: OmitQueryKey<
			| QueryMessage
			| TransactionMessage
			| DestroyMessage
			| FunctionMessage
			| ImportMessage
		>
	) => {
		if (this.isWorkerDestroyed === true) {
			throw new Error(
				'This SQLocal client has been destroyed. You will need to initialize a new client in order to make further queries.'
			);
		}

		const queryKey = nanoid() satisfies QueryKey;

		switch (message.type) {
			case 'import':
				this.worker.postMessage(
					{
						...message,
						queryKey,
					} satisfies ImportMessage,
					[message.database]
				);
				break;
			default:
				this.worker.postMessage({
					...message,
					queryKey,
				} satisfies
					| QueryMessage
					| TransactionMessage
					| DestroyMessage
					| FunctionMessage);
				break;
		}

		return new Promise<OutputMessage>((resolve, reject) => {
			this.queriesInProgress.set(queryKey, [resolve, reject]);
		});
	};

	protected convertSqlTemplate = (
		queryTemplate: TemplateStringsArray,
		...params: any[]
	) => {
		return {
			sql: queryTemplate.join('?'),
			params,
		};
	};

	protected convertRowsToObjects = (rows: any[], columns: string[]) => {
		return rows.map((row) => {
			const rowObj = {} as Record<string, any>;
			columns.forEach((column, columnIndex) => {
				rowObj[column] = row[columnIndex];
			});
			return rowObj;
		});
	};

	protected exec = async (
		sql: string,
		params: any[],
		method: Sqlite3Method = 'all'
	) => {
		const message = await this.createQuery({
			type: 'query',
			sql,
			params,
			method,
		});

		let data = {
			rows: [] as any[],
			columns: [] as string[],
		};

		if (message.type === 'data') {
			data.rows = message.rows;
			data.columns = message.columns;
		}

		return data;
	};

	sql = async <T extends Record<string, any>[]>(
		queryTemplate: TemplateStringsArray,
		...params: any[]
	) => {
		const statement = this.convertSqlTemplate(queryTemplate, ...params);
		const { rows, columns } = await this.exec(
			statement.sql,
			statement.params,
			'all'
		);
		return this.convertRowsToObjects(rows, columns) as T;
	};

	transaction = async (
		passStatements: (
			sql: SQLocal['convertSqlTemplate']
		) => ReturnType<SQLocal['convertSqlTemplate']>[]
	) => {
		const statements = passStatements(this.convertSqlTemplate);
		await this.createQuery({
			type: 'transaction',
			statements,
		});
	};

	createCallbackFunction = async (
		functionName: string,
		handler: CallbackUserFunction['handler']
	) => {
		await this.createQuery({
			type: 'function',
			functionName,
		});

		this.userCallbacks.set(functionName, handler);
	};

	getDatabaseFile = async () => {
		const opfs = await navigator.storage.getDirectory();
		const fileHandle = await opfs.getFileHandle(this.databasePath);
		return await fileHandle.getFile();
	};

	overwriteDatabaseFile = async (
		databaseFile: File | Blob | ArrayBuffer | Uint8Array
	) => {
		let database: ArrayBuffer | Uint8Array;

		if (databaseFile instanceof Blob) {
			database = await databaseFile.arrayBuffer();
		} else {
			database = databaseFile;
		}

		await this.createQuery({
			type: 'import',
			database,
		});
	};

	destroy = async () => {
		await this.createQuery({ type: 'destroy' });
		this.worker.removeEventListener('message', this.processMessageEvent);
		this.queriesInProgress.clear();
		this.userCallbacks.clear();
		this.worker.terminate();
		this.isWorkerDestroyed = true;
	};
}
