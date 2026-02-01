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
	ReactiveQuery,
	SqlTag,
	TransactionHandle,
} from './types.js';
import type {
	BatchMessage,
	BroadcastMessage,
	ConfigMessage,
	DeleteMessage,
	DestroyMessage,
	EffectsMessage,
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
import { mutationLock, type MutationLockOptions } from './lib/mutation-lock.js';
import { normalizeDatabaseFile } from './lib/normalize-database-file.js';
import { SQLiteMemoryDriver } from './drivers/sqlite-memory-driver.js';
import { SQLiteKvvfsDriver } from './drivers/sqlite-kvvfs-driver.js';
import { getDatabaseKey } from './lib/get-database-key.js';

export class SQLocal {
	protected config: ClientConfig;
	protected clientKey: QueryKey;
	protected processor: SQLocalProcessor | Worker;
	protected isDestroyed: boolean = false;
	protected bypassMutationLock: boolean = false;
	protected transactionQueryKeyQueue: QueryKey[] = [];
	protected userCallbacks: Map<string, CallbackUserFunction['func']> =
		new Map();
	protected queriesInProgress: Map<
		QueryKey,
		[
			resolve: (message: OutputMessage) => void,
			reject: (error: unknown) => void,
		]
	> = new Map();

	protected proxy: WorkerProxy;
	protected reinitChannel: BroadcastChannel;
	protected effectsChannel?: BroadcastChannel;

	constructor(databasePath: DatabasePath);
	constructor(config: ClientConfig);
	constructor(config: DatabasePath | ClientConfig) {
		const clientConfig =
			typeof config === 'string' ? { databasePath: config } : config;
		const { onInit, onConnect, processor, ...commonConfig } = clientConfig;
		const { databasePath } = commonConfig;

		this.config = clientConfig;
		this.clientKey = getQueryKey();
		const dbKey = getDatabaseKey(databasePath, this.clientKey);

		this.reinitChannel = new BroadcastChannel(`_sqlocal_reinit_(${dbKey})`);

		if (commonConfig.reactive) {
			this.effectsChannel = new BroadcastChannel(`_sqlocal_effects_(${dbKey})`);
		}

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
			{
				mode: 'shared',
				key: getDatabaseKey(this.config.databasePath, this.clientKey),
				bypass:
					this.bypassMutationLock ||
					message.type === 'import' ||
					message.type === 'delete',
			},
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

	exec = async (
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
			const results = message.data[0];
			data.rows = results?.rows ?? [];
			data.columns = results?.columns ?? [];
			data.numAffectedRows = results?.numAffectedRows;
		}

		return data;
	};

	protected execBatch = async (
		statements: Statement[],
		transactionKey?: QueryKey
	): Promise<RawResultData[]> => {
		const message = await this.createQuery({
			type: 'batch',
			transactionKey,
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
		const statement = sqlTag(queryTemplate, params);
		const { rows, columns } = await this.exec(
			statement.sql,
			statement.params,
			'all'
		);
		return convertRowsToObjects(rows, columns) as Result[];
	};

	batch = async <Result extends Record<string, any>>(
		passStatements: (sql: SqlTag) => Statement[]
	): Promise<Result[][]> => {
		const statements = passStatements(sqlTag);
		const data = await this.execBatch(statements);

		return data.map(({ rows, columns }) => {
			return convertRowsToObjects(rows, columns) as Result[];
		});
	};

	beginTransaction = async (): Promise<Transaction> => {
		const transactionKey = getQueryKey();

		await this.createQuery({
			type: 'transaction',
			transactionKey,
			action: 'begin',
		});

		const transaction: Pick<Transaction, 'lastAffectedRows'> = {
			lastAffectedRows: undefined,
		};

		const query = async <Result extends Record<string, any>>(
			passStatement: StatementInput<Result>
		): Promise<Result[]> => {
			const statement = normalizeStatement(passStatement);
			if (statement.exec) {
				this.transactionQueryKeyQueue.push(transactionKey);
				return statement.exec();
			}
			const { rows, columns, numAffectedRows } = await this.exec(
				statement.sql,
				statement.params,
				'all',
				transactionKey
			);
			transaction.lastAffectedRows = numAffectedRows;
			return convertRowsToObjects(rows, columns) as Result[];
		};

		const sql = async <Result extends Record<string, any>>(
			queryTemplate: TemplateStringsArray | string,
			...params: unknown[]
		): Promise<Result[]> => {
			const statement = sqlTag(queryTemplate, params);
			return query<Result>(statement);
		};

		const batch = async <Result extends Record<string, any>>(
			passStatements: (sql: SqlTag) => Statement[]
		): Promise<Result[][]> => {
			const statements = passStatements(sqlTag);
			const data = await this.execBatch(statements, transactionKey);

			return data.map(({ rows, columns }) => {
				return convertRowsToObjects(rows, columns) as Result[];
			});
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

		return Object.assign(transaction, {
			transactionKey,
			query,
			sql,
			batch,
			commit,
			rollback,
		});
	};

	transaction = async <Result>(
		transaction: (tx: TransactionHandle) => Promise<Result>
	): Promise<Result> => {
		const dbLockOptions: MutationLockOptions = {
			mode: this.processor instanceof Worker ? 'shared' : 'exclusive',
			bypass: false,
			key: getDatabaseKey(this.config.databasePath, this.clientKey),
		};
		const connectionLockOptions: MutationLockOptions = {
			mode: 'exclusive',
			bypass: false,
			key: this.clientKey,
		};

		return mutationLock(dbLockOptions, async () => {
			return mutationLock(connectionLockOptions, async () => {
				let tx: Transaction | undefined;
				this.bypassMutationLock = true;

				try {
					tx = await this.beginTransaction();
					const result = await transaction({
						query: tx.query,
						sql: tx.sql,
						batch: tx.batch,
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
		});
	};

	reactiveQuery = <Result extends Record<string, any>>(
		passStatement: StatementInput<Result>
	): ReactiveQuery<Result> => {
		let value: Result[] = [];
		let gotFirstValue = false;
		let isListening = false;
		let updateCount = 0;

		const statement = normalizeStatement(passStatement);
		const watchedTables = new Set<string>();
		const subObservers = new Set<(results: Result[]) => void>();
		const errObservers = new Set<(err: Error) => void>();

		const runStatement = async (): Promise<void> => {
			try {
				const updateOrder = ++updateCount;

				if (watchedTables.size === 0) {
					const usedTables = await this.sql(
						"SELECT name, wr FROM tables_used(?) WHERE type = 'table'",
						statement.sql
					);
					const readTables = new Set<string>();
					const writtenTables = new Set<string>();

					usedTables.forEach((table) => {
						if (typeof table.name !== 'string') return;
						table.wr
							? writtenTables.add(table.name)
							: readTables.add(table.name);
					});

					if (readTables.size === 0) {
						throw new Error('The passed SQL does not read any tables.');
					}

					if (
						Array.from(writtenTables).some((table) => readTables.has(table))
					) {
						throw new Error(
							'The passed SQL would mutate one or more of the tables that it reads. Doing this in a reactive query would create an infinite loop.'
						);
					}

					readTables.forEach((name) => watchedTables.add(name));
				}

				const results = statement.exec
					? await statement.exec<Result>()
					: await this.sql<Result>(statement.sql, ...statement.params);

				if (updateOrder === updateCount) {
					value = results;
					gotFirstValue = true;
					subObservers.forEach((observer) => observer(value));
				}
			} catch (err) {
				errObservers.forEach((observer) => {
					observer(err instanceof Error ? err : new Error(String(err)));
				});
			}
		};

		const onEffect = (message: MessageEvent<EffectsMessage>): void => {
			if (message.data.tables.some((table) => watchedTables.has(table))) {
				runStatement();
			}
		};

		return {
			get value() {
				return value;
			},
			subscribe: (
				onData: (results: Result[]) => void,
				onError?: (err: Error) => void
			) => {
				if (!this.effectsChannel) {
					throw new Error(
						'This SQLocal instance is not configured for reactive queries. Set the "reactive" option to enable them.'
					);
				}

				if (!onError) {
					onError = (err) => {
						throw err;
					};
				}

				subObservers.add(onData);
				errObservers.add(onError);

				if (!isListening) {
					this.effectsChannel.addEventListener('message', onEffect);
					isListening = true;
					runStatement();
				} else if (gotFirstValue) {
					onData(value);
				}

				return {
					unsubscribe: () => {
						subObservers.delete(onData);
						errObservers.delete(onError);
						if (subObservers.size !== 0) return;
						this.effectsChannel?.removeEventListener('message', onEffect);
						isListening = false;
					},
				};
			},
		};
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
			| Uint8Array<ArrayBuffer>
			| ReadableStream<Uint8Array<ArrayBuffer>>,
		beforeUnlock?: () => void | Promise<void>
	): Promise<void> => {
		await mutationLock(
			{
				mode: 'exclusive',
				bypass: false,
				key: getDatabaseKey(this.config.databasePath, this.clientKey),
			},
			async () => {
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
			}
		);
	};

	deleteDatabaseFile = async (
		beforeUnlock?: () => void | Promise<void>
	): Promise<void> => {
		await mutationLock(
			{
				mode: 'exclusive',
				bypass: false,
				key: getDatabaseKey(this.config.databasePath, this.clientKey),
			},
			async () => {
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
			}
		);
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
		this.effectsChannel?.close();
		this.isDestroyed = true;
	};

	[Symbol.dispose] = (): void => {
		this.destroy();
	};

	[Symbol.asyncDispose] = async (): Promise<void> => {
		await this.destroy();
	};
}
