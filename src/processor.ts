import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import coincident from 'coincident';
import type {
	DataMessage,
	DestroyMessage,
	QueryMessage,
	Sqlite3,
	Sqlite3Db,
	BatchMessage,
	ProcessorConfig,
	FunctionMessage,
	UserFunction,
	OutputMessage,
	InputMessage,
	ImportMessage,
	WorkerProxy,
	GetInfoMessage,
	Sqlite3StorageType,
	EffectsMessage,
	ConfigMessage,
	QueryKey,
	TransactionMessage,
} from './types.js';
import { parseQueryEffects } from './lib/parse-query-effects.js';
import { createMutex } from './lib/create-mutex.js';
import { execOnDb } from './lib/exec-on-db.js';

export class SQLocalProcessor {
	protected sqlite3: Sqlite3 | undefined;
	protected db: Sqlite3Db | undefined;
	protected dbStorageType: Sqlite3StorageType | undefined;
	protected config: ProcessorConfig = {};
	protected userFunctions = new Map<string, UserFunction>();

	protected initMutex = createMutex();
	protected transactionMutex = createMutex();
	protected transactionKey: QueryKey | null = null;
	protected transactionExecutedSql = new Set<string>();

	protected proxy: WorkerProxy;
	protected queryEffectsChannel: BroadcastChannel | undefined;

	onmessage: ((message: OutputMessage) => void) | undefined;

	constructor(worker: typeof globalThis) {
		this.proxy = coincident(worker) as WorkerProxy;
		this.init();
	}

	protected init = async (): Promise<void> => {
		if (!this.config.databasePath) return;

		await this.initMutex.lock();

		const { databasePath, readOnly, verbose } = this.config;
		const flags = [
			readOnly === true ? 'r' : 'cw',
			verbose === true ? 't' : '',
		].join('');

		try {
			if (!this.sqlite3) {
				this.sqlite3 = await sqlite3InitModule();
			}

			if (this.db) {
				this.destroy();
			}

			if ('opfs' in this.sqlite3) {
				this.db = new this.sqlite3.oo1.OpfsDb(databasePath, flags);
				this.dbStorageType = 'opfs';

				if (this.config.reactive === true) {
					this.queryEffectsChannel = new BroadcastChannel(
						`_sqlocal_query_effects_(${this.config.databasePath})`
					);
				}
			} else {
				this.db = new this.sqlite3.oo1.DB(databasePath, flags);
				this.dbStorageType = 'memory';
				console.warn(
					`The origin private file system is not available, so ${databasePath} will not be persisted. Make sure your web server is configured to use the correct HTTP response headers (See https://sqlocal.dallashoffman.com/guide/setup#cross-origin-isolation).`
				);
			}
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: null,
			});

			this.destroy();
			return;
		}

		this.userFunctions.forEach(this.initUserFunction);
		await this.initMutex.unlock();
	};

	postMessage = async (
		message: InputMessage | MessageEvent<InputMessage>
	): Promise<void> => {
		if (message instanceof MessageEvent) {
			message = message.data;
		}

		await this.initMutex.lock();

		switch (message.type) {
			case 'config':
				this.editConfig(message);
				break;
			case 'query':
			case 'batch':
			case 'transaction':
				this.exec(message);
				break;
			case 'function':
				this.createUserFunction(message);
				break;
			case 'getinfo':
				this.getDatabaseInfo(message);
				break;
			case 'import':
				this.importDb(message);
				break;
			case 'destroy':
				this.destroy(message);
				break;
		}

		await this.initMutex.unlock();
	};

	protected emitMessage = (message: OutputMessage): void => {
		if (this.onmessage) {
			this.onmessage(message);
		}
	};

	protected emitEffectsBroadcast = (executedSql: Set<string>): void => {
		if (!this.queryEffectsChannel) return;

		const allReadTables = new Set<string>();
		const allMutatedTables = new Set<string>();

		executedSql.forEach((sql) => {
			const { readTables, mutatedTables } = parseQueryEffects(sql);
			readTables.forEach((table) => allReadTables.add(table));
			mutatedTables.forEach((table) => allMutatedTables.add(table));
		});

		if (allReadTables.size > 0) {
			this.queryEffectsChannel.postMessage({
				type: 'effects',
				effectType: 'read',
				tables: allReadTables,
			} satisfies EffectsMessage);
		}

		if (allMutatedTables.size > 0) {
			this.queryEffectsChannel.postMessage({
				type: 'effects',
				effectType: 'mutation',
				tables: allMutatedTables,
			} satisfies EffectsMessage);
		}
	};

	protected editConfig = (message: ConfigMessage) => {
		this.config = message.config;
		this.init();
	};

	protected exec = async (
		message: QueryMessage | BatchMessage | TransactionMessage
	): Promise<void> => {
		if (!this.db) return;

		const executedSql = new Set<string>();
		const partOfTransaction =
			(message.type === 'transaction' &&
				(this.transactionKey === null ||
					message.transactionKey === this.transactionKey)) ||
			(message.type === 'query' &&
				message.transactionKey === this.transactionKey);

		if (!partOfTransaction) {
			await this.transactionMutex.lock();
		}

		try {
			const response: DataMessage = {
				type: 'data',
				queryKey: message.queryKey,
				data: [],
			};

			switch (message.type) {
				case 'query':
					const statementData = execOnDb(this.db, message);
					response.data.push(statementData);

					if (!partOfTransaction) {
						executedSql.add(message.sql);
					} else {
						this.transactionExecutedSql.add(message.sql);
					}
					break;

				case 'batch':
					this.db.transaction((tx: Sqlite3Db) => {
						for (let statement of message.statements) {
							const statementData = execOnDb(tx, statement);
							response.data.push(statementData);
						}
					});

					message.statements.forEach((statement) => {
						executedSql.add(statement.sql);
					});
					break;

				case 'transaction':
					if (message.action === 'begin') {
						await this.transactionMutex.lock();
						this.transactionKey = message.transactionKey;
						this.db.exec({ sql: 'BEGIN' });
					}

					if (message.action === 'commit' || message.action === 'rollback') {
						const sql = message.action === 'commit' ? 'COMMIT' : 'ROLLBACK';
						this.db.exec({ sql });
						this.transactionKey = null;
						await this.transactionMutex.unlock();

						if (message.action === 'commit') {
							this.transactionExecutedSql.forEach((sql) => {
								executedSql.add(sql);
							});
						}
						this.transactionExecutedSql.clear();
					}
					break;
			}

			this.emitMessage(response);
			this.emitEffectsBroadcast(executedSql);
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: message.queryKey,
			});
		}

		if (!partOfTransaction) {
			await this.transactionMutex.unlock();
		}
	};

	protected getDatabaseInfo = async (
		message: GetInfoMessage
	): Promise<void> => {
		try {
			const databasePath = this.config.databasePath;
			const storageType = this.dbStorageType;
			const persisted =
				storageType !== undefined
					? storageType !== 'memory'
						? await navigator.storage?.persisted()
						: false
					: undefined;

			const sizeResult = this.db?.exec({
				sql: 'SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()',
				returnValue: 'resultRows',
				rowMode: 'array',
			});
			const size = sizeResult?.[0]?.[0];
			const databaseSizeBytes = typeof size === 'number' ? size : undefined;

			this.emitMessage({
				type: 'info',
				queryKey: message.queryKey,
				info: { databasePath, databaseSizeBytes, storageType, persisted },
			});
		} catch (error) {
			this.emitMessage({
				type: 'error',
				queryKey: message.queryKey,
				error,
			});
		}
	};

	protected createUserFunction = (message: FunctionMessage): void => {
		const { functionName, functionType, queryKey } = message;
		let func;

		if (this.userFunctions.has(functionName)) {
			this.emitMessage({
				type: 'error',
				error: new Error(
					`A user-defined function with the name "${functionName}" has already been created for this SQLocal instance.`
				),
				queryKey,
			});
			return;
		}

		if (functionType === 'callback') {
			func = (...args: any[]) => {
				this.emitMessage({
					type: 'callback',
					name: functionName,
					args: args,
				});
			};
		} else {
			func = this.proxy[`_sqlocal_func_${functionName}`];
		}

		try {
			this.initUserFunction({
				type: functionType,
				name: functionName,
				func,
			});
			this.emitMessage({
				type: 'success',
				queryKey,
			});
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey,
			});
		}
	};

	protected initUserFunction = (fn: UserFunction): void => {
		if (!this.db) return;

		this.db.createFunction({
			name: fn.name,
			xFunc: (_: number, ...args: any[]) => fn.func(...args),
			arity: -1,
		});

		this.userFunctions.set(fn.name, fn);
	};

	protected importDb = async (message: ImportMessage): Promise<void> => {
		if (!this.sqlite3 || !this.config.databasePath) return;

		const { queryKey, database } = message;

		if (!('opfs' in this.sqlite3)) {
			this.emitMessage({
				type: 'error',
				error: new Error(
					'The origin private file system is not available, so a database cannot be imported. Make sure your web server is configured to use the correct HTTP response headers (See https://sqlocal.dallashoffman.com/guide/setup#cross-origin-isolation).'
				),
				queryKey,
			});
			return;
		}

		try {
			await this.sqlite3.oo1.OpfsDb.importDb(
				this.config.databasePath,
				database
			);
			await this.init();
			this.emitMessage({
				type: 'success',
				queryKey,
			});
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey,
			});
		}
	};

	protected destroy = (message?: DestroyMessage): void => {
		if (this.db) {
			this.db.exec({ sql: 'PRAGMA optimize' });
			this.db.close();
			this.db = undefined;
			this.dbStorageType = undefined;
		}

		if (this.queryEffectsChannel) {
			this.queryEffectsChannel.close();
			this.queryEffectsChannel = undefined;
		}

		if (message) {
			this.emitMessage({
				type: 'success',
				queryKey: message.queryKey,
			});
		}
	};
}
