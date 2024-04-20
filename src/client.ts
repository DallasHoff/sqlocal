import coincident from 'coincident';
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
	RawResultData,
	Sqlite3Method,
	BatchMessage,
	WorkerProxy,
	ScalarUserFunction,
} from './types.js';

export class SQLocal {
	protected databasePath: string;
	protected worker: Worker;
	protected proxy: WorkerProxy;
	protected isWorkerDestroyed: boolean = false;
	protected userCallbacks = new Map<string, CallbackUserFunction['func']>();
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

		this.proxy = coincident(this.worker) as WorkerProxy;
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
			| BatchMessage
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
					| BatchMessage
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
		...params: unknown[]
	) => {
		return {
			sql: queryTemplate.join('?'),
			params,
		};
	};

	protected convertRowsToObjects = (
		rows: unknown[] | unknown[][],
		columns: string[]
	) => {
		let checkedRows: unknown[][];

		const isArrayOfArrays = (
			rows: unknown[] | unknown[][]
		): rows is unknown[][] => {
			return !rows.some((row) => !Array.isArray(row));
		};

		if (isArrayOfArrays(rows)) {
			checkedRows = rows;
		} else {
			checkedRows = [rows];
		}

		return checkedRows.map((row) => {
			const rowObj = {} as Record<string, unknown>;
			columns.forEach((column, columnIndex) => {
				rowObj[column] = row[columnIndex];
			});

			return rowObj;
		});
	};

	protected exec = async (
		sql: string,
		params: unknown[],
		method: Sqlite3Method = 'all'
	) => {
		const message = await this.createQuery({
			type: 'query',
			sql,
			params,
			method,
		});

		const data: RawResultData = {
			rows: [],
			columns: [],
		};

		if (message.type === 'data') {
			data.rows = message.data[0].rows;
			data.columns = message.data[0].columns;
		}

		return data;
	};

	protected execBatch = async (
		statements: ReturnType<SQLocal['convertSqlTemplate']>[]
	) => {
		const message = await this.createQuery({
			type: 'batch',
			statements,
		});
		const data = new Array(statements.length).fill({
			rows: [],
			columns: [],
		}) as RawResultData[];

		if (message.type === 'data') {
			message.data.forEach((result, resultIndex) => {
				data[resultIndex] = result;
			});
		}

		return data;
	};

	sql = async <T extends Record<string, any>[]>(
		queryTemplate: TemplateStringsArray,
		...params: unknown[]
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
		const data = await this.execBatch(statements);

		return data.map(({ rows, columns }) => {
			return this.convertRowsToObjects(rows, columns);
		});
	};

	createCallbackFunction = async (
		funcName: string,
		func: CallbackUserFunction['func']
	) => {
		await this.createQuery({
			type: 'function',
			functionName: funcName,
			functionType: 'callback',
		});

		this.userCallbacks.set(funcName, func);
	};

	createScalarFunction = async (
		funcName: string,
		func: ScalarUserFunction['func']
	) => {
		await this.createQuery({
			type: 'function',
			functionName: funcName,
			functionType: 'scalar',
		});

		this.proxy[`_sqlocal_func_${funcName}`] = func;
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
