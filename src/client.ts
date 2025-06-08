import coincident from 'coincident';
import type {
	CallbackUserFunction,
	QueryKey,
	RawResultData,
	Sqlite3Method,
	ScalarUserFunction,
	Statement,
	DatabaseInfo,
	ClientConfig,
	StatementInput,
	Transaction,
	DatabasePath,
	AggregateUserFunction,
} from './types.js';
import type {
	BatchMessage,
	BroadcastMessage,
	ConfigMessage,
	DeleteMessage,
	DestroyMessage,
	ExportMessage,
	FunctionMessage,
	GetInfoMessage,
	ImportMessage,
	OmitQueryKey,
	OutputMessage,
	QueryMessage,
	TransactionMessage,
	WorkerProxy,
} from './messages.js';
import { SQLocalProcessor } from './processor.js';
import { sqlTag } from './lib/sql-tag.js';
import { convertRowsToObjects } from './lib/convert-rows-to-objects.js';
import { normalizeStatement } from './lib/normalize-statement.js';
import { getQueryKey } from './lib/get-query-key.js';
import { normalizeSql } from './lib/normalize-sql.js';
import { mutationLock } from './lib/mutation-lock.js';
import { normalizeDatabaseFile } from './lib/normalize-database-file.js';
import { SQLiteMemoryDriver } from './drivers/sqlite-memory-driver.js';
import { SQLiteKvvfsDriver } from './drivers/sqlite-kvvfs-driver.js';

export class SQLocal {
	protected config: ClientConfig;
	protected clientKey: QueryKey;
	protected processor: SQLocalProcessor | Worker;
	protected isDestroyed: boolean = false;
	protected bypassMutationLock: boolean = false;
	protected userCallbacks = new Map<string, CallbackUserFunction['func']>();
	protected queriesInProgress = new Map<
		QueryKey,
		[
			resolve: (message: OutputMessage) => void,
			reject: (error: unknown) => void,
		]
	>();

	protected proxy: WorkerProxy;
	protected reinitChannel: BroadcastChannel;

	constructor(databasePath: DatabasePath);
	constructor(config: ClientConfig);
	constructor(config: DatabasePath | ClientConfig) {
		const clientConfig =
			typeof config === 'string' ? { databasePath: config } : config;
		const { onInit, onConnect, processor, ...commonConfig } = clientConfig;
		const { databasePath } = commonConfig;

		this.config = clientConfig;
		this.clientKey = getQueryKey();
		this.reinitChannel = new BroadcastChannel(
			`_sqlocal_reinit_(${databasePath})`
		);

		if (typeof processor !== 'undefined') {
			this.processor = processor;
		} else if (databasePath === 'local' || databasePath === ':localStorage:') {
			const driver = new SQLiteKvvfsDriver('local');
			this.processor = new SQLocalProcessor(driver);
		} else if (
			databasePath === 'session' ||
			databasePath === ':sessionStorage:'
		) {
			const driver = new SQLiteKvvfsDriver('session');
			this.processor = new SQLocalProcessor(driver);
		} else if (
			typeof globalThis.Worker !== 'undefined' &&
			databasePath !== ':memory:'
		) {
			this.processor = new Worker(new URL('./worker', import.meta.url), {
				type: 'module',
			});
		} else {
			const driver = new SQLiteMemoryDriver();
			this.processor = new SQLocalProcessor(driver);
		}

		if (this.processor instanceof SQLocalProcessor) {
			this.processor.onmessage = (message) => this.processMessageEvent(message);
			this.proxy = globalThis as WorkerProxy;
		} else {
			this.processor.addEventListener('message', this.processMessageEvent);
			this.proxy = coincident(this.processor) as WorkerProxy;
		}

		this.processor.postMessage({
			type: 'config',
			config: {
				...commonConfig,
				clientKey: this.clientKey,
				onInitStatements: onInit?.(sqlTag) ?? [],
			},
		} satisfies ConfigMessage);
	}

	protected processMessageEvent = (
		event: OutputMessage | MessageEvent<OutputMessage>
	): void => {
		const message = event instanceof MessageEvent ? event.data : event;
		const queries = this.queriesInProgress;

		switch (message.type) {
			case 'success':
			case 'data':
			case 'buffer':
			case 'info':
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

			case 'event':
				this.config.onConnect?.(message.reason);
				break;
		}
	};

	protected createQuery = async (
		message: OmitQueryKey<
			| QueryMessage
			| BatchMessage
			| TransactionMessage
			| FunctionMessage
			| GetInfoMessage
			| ImportMessage
			| ExportMessage
			| DeleteMessage
			| DestroyMessage
		>
	): Promise<OutputMessage> => {
		return mutationLock(
			'shared',
			this.bypassMutationLock ||
				message.type === 'import' ||
				message.type === 'delete',
			this.config,
			async () => {
				if (this.isDestroyed === true) {
					throw new Error(
						'This SQLocal client has been destroyed. You will need to initialize a new client in order to make further queries.'
					);
				}

				const queryKey = getQueryKey();

				switch (message.type) {
					case 'import':
						this.processor.postMessage(
							{
								...message,
								queryKey,
							} satisfies ImportMessage,
							[message.database]
						);
						break;
					default:
						this.processor.postMessage({
							...message,
							queryKey,
						} satisfies
							| QueryMessage
							| BatchMessage
							| TransactionMessage
							| FunctionMessage
							| GetInfoMessage
							| ExportMessage
							| DeleteMessage
							| DestroyMessage);
						break;
				}

				return new Promise<OutputMessage>((resolve, reject) => {
					this.queriesInProgress.set(queryKey, [resolve, reject]);
				});
			}
		);
	};

	protected broadcast = (message: BroadcastMessage): void => {
		this.reinitChannel.postMessage(message);
	};

	protected exec = async (
		sql: string,
		params: unknown[],
		method: Sqlite3Method = 'all',
		transactionKey?: QueryKey
	): Promise<RawResultData> => {
		const message = await this.createQuery({
			type: 'query',
			transactionKey,
			sql,
			params,
			method,
		});

		const data: RawResultData = {
			rows: [],
			columns: [],
		};

		if (message.type === 'data') {
			data.rows = message.data[0]?.rows ?? [];
			data.columns = message.data[0]?.columns ?? [];
		}

		return data;
	};

	protected execBatch = async (
		statements: Statement[]
	): Promise<RawResultData[]> => {
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

	sql = async <Result extends Record<string, any>>(
		queryTemplate: TemplateStringsArray | string,
		...params: unknown[]
	): Promise<Result[]> => {
		const statement = normalizeSql(queryTemplate, params);
		const { rows, columns } = await this.exec(
			statement.sql,
			statement.params,
			'all'
		);
		const resultRecords = convertRowsToObjects(rows, columns);
		return resultRecords as Result[];
	};

	batch = async <Result extends Record<string, any>>(
		passStatements: (sql: typeof sqlTag) => Statement[]
	): Promise<Result[][]> => {
		const statements = passStatements(sqlTag);
		const data = await this.execBatch(statements);

		return data.map(({ rows, columns }) => {
			const resultRecords = convertRowsToObjects(rows, columns);
			return resultRecords as Result[];
		});
	};

	beginTransaction = async (): Promise<Transaction> => {
		const transactionKey = getQueryKey();

		await this.createQuery({
			type: 'transaction',
			transactionKey,
			action: 'begin',
		});

		const query = async <Result extends Record<string, any>>(
			passStatement: StatementInput<Result>
		): Promise<Result[]> => {
			const statement = normalizeStatement(passStatement);
			const { rows, columns } = await this.exec(
				statement.sql,
				statement.params,
				'all',
				transactionKey
			);
			const resultRecords = convertRowsToObjects(rows, columns) as Result[];
			return resultRecords;
		};

		const sql = async <Result extends Record<string, any>>(
			queryTemplate: TemplateStringsArray | string,
			...params: unknown[]
		): Promise<Result[]> => {
			const statement = normalizeSql(queryTemplate, params);
			const resultRecords = await query<Result>(statement);
			return resultRecords;
		};

		const commit = async (): Promise<void> => {
			await this.createQuery({
				type: 'transaction',
				transactionKey,
				action: 'commit',
			});
		};

		const rollback = async (): Promise<void> => {
			await this.createQuery({
				type: 'transaction',
				transactionKey,
				action: 'rollback',
			});
		};

		return {
			query,
			sql,
			commit,
			rollback,
		};
	};

	transaction = async <Result>(
		transaction: (tx: {
			sql: Transaction['sql'];
			query: Transaction['query'];
		}) => Promise<Result>
	): Promise<Result> => {
		return mutationLock('exclusive', false, this.config, async () => {
			let tx: Transaction | undefined;
			this.bypassMutationLock = true;

			try {
				tx = await this.beginTransaction();
				const result = await transaction({
					sql: tx.sql,
					query: tx.query,
				});
				await tx.commit();
				return result;
			} catch (err) {
				await tx?.rollback();
				throw err;
			} finally {
				this.bypassMutationLock = false;
			}
		});
	};

	createCallbackFunction = async (
		funcName: string,
		func: CallbackUserFunction['func']
	): Promise<void> => {
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
	): Promise<void> => {
		const key = `_sqlocal_func_${funcName}`;
		const attachFunction = () => {
			this.proxy[key] = func;
		};

		if (this.proxy === globalThis) {
			attachFunction();
		}

		await this.createQuery({
			type: 'function',
			functionName: funcName,
			functionType: 'scalar',
		});

		if (this.proxy !== globalThis) {
			attachFunction();
		}
	};

	createAggregateFunction = async (
		funcName: string,
		func: AggregateUserFunction['func']
	): Promise<void> => {
		const key = `_sqlocal_func_${funcName}`;
		const attachFunction = () => {
			this.proxy[`${key}_step`] = func.step;
			this.proxy[`${key}_final`] = func.final;
		};

		if (this.proxy === globalThis) {
			attachFunction();
		}

		await this.createQuery({
			type: 'function',
			functionName: funcName,
			functionType: 'aggregate',
		});

		if (this.proxy !== globalThis) {
			attachFunction();
		}
	};

	getDatabaseInfo = async (): Promise<DatabaseInfo> => {
		const message = await this.createQuery({ type: 'getinfo' });

		if (message.type === 'info') {
			return message.info;
		} else {
			throw new Error('The database failed to return valid information.');
		}
	};

	getDatabaseFile = async (): Promise<File> => {
		const message = await this.createQuery({ type: 'export' });

		if (message.type === 'buffer') {
			return new File([message.buffer], message.bufferName, {
				type: 'application/x-sqlite3',
			});
		} else {
			throw new Error('The database failed to export.');
		}
	};

	overwriteDatabaseFile = async (
		databaseFile:
			| File
			| Blob
			| ArrayBuffer
			| Uint8Array
			| ReadableStream<Uint8Array>,
		beforeUnlock?: () => void | Promise<void>
	): Promise<void> => {
		await mutationLock('exclusive', false, this.config, async () => {
			try {
				this.broadcast({
					type: 'close',
					clientKey: this.clientKey,
				});

				const database = await normalizeDatabaseFile(databaseFile, 'buffer');

				await this.createQuery({
					type: 'import',
					database,
				});

				if (typeof beforeUnlock === 'function') {
					this.bypassMutationLock = true;
					await beforeUnlock();
				}

				this.broadcast({
					type: 'reinit',
					clientKey: this.clientKey,
					reason: 'overwrite',
				});
			} finally {
				this.bypassMutationLock = false;
			}
		});
	};

	deleteDatabaseFile = async (
		beforeUnlock?: () => void | Promise<void>
	): Promise<void> => {
		await mutationLock('exclusive', false, this.config, async () => {
			try {
				this.broadcast({
					type: 'close',
					clientKey: this.clientKey,
				});

				await this.createQuery({
					type: 'delete',
				});

				if (typeof beforeUnlock === 'function') {
					this.bypassMutationLock = true;
					await beforeUnlock();
				}

				this.broadcast({
					type: 'reinit',
					clientKey: this.clientKey,
					reason: 'delete',
				});
			} finally {
				this.bypassMutationLock = false;
			}
		});
	};

	destroy = async (): Promise<void> => {
		await this.createQuery({ type: 'destroy' });

		if (
			typeof globalThis.Worker !== 'undefined' &&
			this.processor instanceof Worker
		) {
			this.processor.removeEventListener('message', this.processMessageEvent);
			this.processor.terminate();
		}

		this.queriesInProgress.clear();
		this.userCallbacks.clear();
		this.reinitChannel.close();
		this.isDestroyed = true;
	};

	[Symbol.dispose] = () => {
		this.destroy();
	};

	[Symbol.asyncDispose] = async () => {
		await this.destroy();
	};
}
