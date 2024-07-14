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
	GetInfoMessage,
	Statement,
	EffectsMessage,
	ReturningStatement,
} from './types.js';
import { parseQueryEffects } from './lib/parse-query-effects.js';
import { sqlTag } from './lib/sql-tag.js';
import { convertRowsToObjects } from './lib/convert-rows-to-objects.js';
import { normalizeStatement } from './lib/normalize-statement.js';

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
			case 'info':
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
			| GetInfoMessage
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
					| FunctionMessage
					| GetInfoMessage);
				break;
		}

		return new Promise<OutputMessage>((resolve, reject) => {
			this.queriesInProgress.set(queryKey, [resolve, reject]);
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

	protected execBatch = async (statements: Statement[]) => {
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

	protected execAndConvert = async <T extends Record<string, any>>(
		statement: ReturningStatement<T>
	) => {
		const { sql, params } = normalizeStatement(statement);
		const { rows, columns } = await this.exec(sql, params, 'all');
		const resultRecords = convertRowsToObjects(rows, columns);
		return resultRecords as T[];
	};

	sql = async <T extends Record<string, any>>(
		queryTemplate: TemplateStringsArray,
		...params: unknown[]
	) => {
		const statement = sqlTag(queryTemplate, ...params);
		const resultRecords = await this.execAndConvert<T>(statement);
		return resultRecords;
	};

	transaction = async (passStatements: (sql: typeof sqlTag) => Statement[]) => {
		const statements = passStatements(sqlTag);
		const data = await this.execBatch(statements);

		return data.map(({ rows, columns }) => {
			return convertRowsToObjects(rows, columns);
		});
	};

	batch = async (passStatements: (sql: typeof sqlTag) => Statement[]) => {
		return await this.transaction(passStatements);
	};

	reactiveQuery = <T extends Record<string, any>>(
		statement:
			| ReturningStatement<T>
			| ((sql: typeof sqlTag) => ReturningStatement<T>),
		callback: (data: T[]) => void
	) => {
		statement = typeof statement === 'function' ? statement(sqlTag) : statement;
		const { readTables, mutatedTables } = parseQueryEffects(statement.sql);

		if (mutatedTables.length > 0) {
			throw new Error(
				'The passed SQL would mutate one or more tables. Reactive queries must use non-mutating queries to avoid infinite loops.'
			);
		}

		if (readTables.length > 0) {
			this.execAndConvert<T>(statement).then((initialData) => {
				callback(initialData);
			});
		} else {
			throw new Error('The passed SQL does not read any tables.');
		}

		const queryEffectsChannel = new BroadcastChannel(
			`_sqlocal_query_effects_(${this.databasePath})`
		);

		queryEffectsChannel.onmessage = async (
			event: MessageEvent<EffectsMessage>
		) => {
			const message = event.data;
			if (message.effectType === 'read') return;

			const queryAffected = readTables.some((table) => {
				return message.tables.has(table);
			});

			if (queryAffected) {
				const newData = await this.execAndConvert<T>(statement);
				callback(newData);
			}
		};

		return () => {
			queryEffectsChannel.close();
		};
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

	getDatabaseInfo = async () => {
		const message = await this.createQuery({ type: 'getinfo' });

		if (message.type === 'info') {
			return message.info;
		} else {
			throw new Error('The database failed to return valid information.');
		}
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
