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
	ConfigMessage,
	QueryKey,
	TransactionMessage,
	DeleteMessage,
	ExportMessage,
	ConnectReason,
	ReinitMessage,
} from './types.js';
import { createMutex } from './lib/create-mutex.js';
import { execOnDb } from './lib/exec-on-db.js';
import { parseDatabasePath } from './lib/parse-database-path.js';
import { normalizeDatabaseFile } from './lib/normalize-database-file.js';

export class SQLocalProcessor {
	protected sqlite3?: Sqlite3;
	protected db?: Sqlite3Db;
	protected dbStorageType?: Sqlite3StorageType;
	protected config: ProcessorConfig = {};
	protected pointers: number[] = [];
	protected userFunctions = new Map<string, UserFunction>();

	protected initMutex = createMutex();
	protected transactionMutex = createMutex();
	protected transactionKey: QueryKey | null = null;

	protected proxy: WorkerProxy;
	protected reinitChannel?: BroadcastChannel;

	onmessage?: (message: OutputMessage, transfer: Transferable[]) => void;

	constructor(sameContext: boolean) {
		const proxy = sameContext ? globalThis : coincident(globalThis);
		this.proxy = proxy as WorkerProxy;
		this.init('initial');
	}

	protected init = async (reason: ConnectReason): Promise<void> => {
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

			if ('opfs' in this.sqlite3 && databasePath !== ':memory:') {
				this.db = new this.sqlite3.oo1.OpfsDb(databasePath, flags);
				this.dbStorageType = 'opfs';
			} else {
				this.db = new this.sqlite3.oo1.DB(databasePath, flags);
				this.dbStorageType = 'memory';

				if (databasePath !== ':memory:') {
					console.warn(
						`The origin private file system is not available, so ${databasePath} will not be persisted. Make sure your web server is configured to use the correct HTTP response headers (See https://sqlocal.dallashoffman.com/guide/setup#cross-origin-isolation).`
					);
				}
			}

			if (this.dbStorageType !== 'memory') {
				this.reinitChannel = new BroadcastChannel(
					`_sqlocal_reinit_(${databasePath})`
				);
				this.reinitChannel.onmessage = (event: MessageEvent<ReinitMessage>) => {
					if (this.config.clientKey !== event.data.clientKey) {
						this.init(event.data.reason);
					}
				};
			}

			this.userFunctions.forEach(this.initUserFunction);
			this.execInitStatements();
			this.emitMessage({ type: 'event', event: 'connect', reason });
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: null,
			});

			this.destroy();
		} finally {
			await this.initMutex.unlock();
		}
	};

	postMessage = async (
		event: InputMessage | MessageEvent<InputMessage>,
		_transfer?: Transferable
	): Promise<void> => {
		const message = event instanceof MessageEvent ? event.data : event;

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
			case 'export':
				this.exportDb(message);
				break;
			case 'delete':
				this.deleteDb(message);
				break;
			case 'destroy':
				this.destroy(message);
				break;
		}

		await this.initMutex.unlock();
	};

	protected emitMessage = (
		message: OutputMessage,
		transfer: Transferable[] = []
	): void => {
		if (this.onmessage) {
			this.onmessage(message, transfer);
		}
	};

	protected editConfig = (message: ConfigMessage): void => {
		this.config = message.config;
		this.init('initial');
	};

	protected exec = async (
		message: QueryMessage | BatchMessage | TransactionMessage
	): Promise<void> => {
		if (!this.db) return;

		try {
			const response: DataMessage = {
				type: 'data',
				queryKey: message.queryKey,
				data: [],
			};

			switch (message.type) {
				case 'query':
					const partOfTransaction =
						this.transactionKey !== null &&
						this.transactionKey === message.transactionKey;

					try {
						if (!partOfTransaction) {
							await this.transactionMutex.lock();
						}
						const statementData = execOnDb(this.db, message);
						response.data.push(statementData);
					} finally {
						if (!partOfTransaction) {
							await this.transactionMutex.unlock();
						}
					}
					break;

				case 'batch':
					try {
						await this.transactionMutex.lock();
						this.db.transaction((tx) => {
							for (let statement of message.statements) {
								const statementData = execOnDb(tx, statement);
								response.data.push(statementData);
							}
						});
					} finally {
						await this.transactionMutex.unlock();
					}
					break;

				case 'transaction':
					if (message.action === 'begin') {
						await this.transactionMutex.lock();
						this.transactionKey = message.transactionKey;
						this.db.exec({ sql: 'BEGIN' });
					}

					if (
						(message.action === 'commit' || message.action === 'rollback') &&
						this.transactionKey !== null &&
						this.transactionKey === message.transactionKey
					) {
						const sql = message.action === 'commit' ? 'COMMIT' : 'ROLLBACK';
						this.db.exec({ sql });
						this.transactionKey = null;
						await this.transactionMutex.unlock();
					}
					break;
			}

			this.emitMessage(response);
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: message.queryKey,
			});
		}
	};

	protected execInitStatements = (): void => {
		if (this.db && this.config.onInitStatements) {
			for (let statement of this.config.onInitStatements) {
				execOnDb(this.db, statement);
			}
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
		if (!this.sqlite3 || !this.config.databasePath || !this.db) return;

		const { queryKey, database } = message;
		let errored = false;

		try {
			if (this.dbStorageType === 'opfs') {
				this.destroy();
				const data = await normalizeDatabaseFile(database, 'callback');
				await this.sqlite3.oo1.OpfsDb.importDb(this.config.databasePath, data);
			} else {
				const data = await normalizeDatabaseFile(database, 'buffer');
				const dataPointer = this.sqlite3.wasm.allocFromTypedArray(data);
				this.pointers.push(dataPointer);
				const resultCode = this.sqlite3.capi.sqlite3_deserialize(
					this.db,
					'main',
					dataPointer,
					data.byteLength,
					data.byteLength,
					this.config.readOnly
						? this.sqlite3.capi.SQLITE_DESERIALIZE_READONLY
						: this.sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
				);
				this.db.checkRc(resultCode);
				this.execInitStatements();
			}
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey,
			});
			errored = true;
		} finally {
			if (this.dbStorageType !== 'memory') {
				await this.init('overwrite');
			}
		}

		if (!errored) {
			this.emitMessage({
				type: 'success',
				queryKey,
			});
		}
	};

	protected exportDb = (message: ExportMessage): void => {
		if (!this.sqlite3 || !this.db) return;

		const { queryKey } = message;

		try {
			const buffer = this.sqlite3.capi.sqlite3_js_db_export(this.db);

			this.emitMessage(
				{
					type: 'buffer',
					queryKey,
					buffer,
				},
				[buffer]
			);
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey,
			});
		}
	};

	protected deleteDb = async (message: DeleteMessage): Promise<void> => {
		if (!this.config.databasePath) return;

		const { queryKey } = message;
		let errored = false;

		try {
			if (this.dbStorageType === 'opfs') {
				const { getDirectoryHandle, fileName, tempFileNames } =
					parseDatabasePath(this.config.databasePath);
				const dirHandle = await getDirectoryHandle();
				const fileNames = [fileName, ...tempFileNames];

				this.destroy();

				await Promise.all(
					fileNames.map(async (name) => {
						return dirHandle.removeEntry(name).catch((err) => {
							if (
								!(err instanceof DOMException && err.name === 'NotFoundError')
							) {
								throw err;
							}
						});
					})
				);
			} else {
				this.destroy();
			}
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey,
			});
			errored = true;
		} finally {
			await this.init('delete');
		}

		if (!errored) {
			this.emitMessage({
				type: 'success',
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

		if (this.reinitChannel) {
			this.reinitChannel.close();
			this.reinitChannel = undefined;
		}

		this.pointers.forEach((pointer) => this.sqlite3?.wasm.dealloc(pointer));
		this.pointers = [];

		if (message) {
			this.emitMessage({
				type: 'success',
				queryKey: message.queryKey,
			});
		}
	};
}
