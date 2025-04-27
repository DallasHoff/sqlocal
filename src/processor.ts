import coincident from 'coincident';
import type {
	ProcessorConfig,
	UserFunction,
	QueryKey,
	ConnectReason,
	SQLocalDriver,
} from './types.js';
import type {
	BatchMessage,
	BroadcastMessage,
	ConfigMessage,
	DataMessage,
	DeleteMessage,
	DestroyMessage,
	ExportMessage,
	FunctionMessage,
	GetInfoMessage,
	ImportMessage,
	InputMessage,
	OutputMessage,
	QueryMessage,
	TransactionMessage,
	WorkerProxy,
} from './messages.js';
import { createMutex } from './lib/create-mutex.js';
import { SQLiteMemoryDriver } from './drivers/sqlite-memory-driver.js';

export class SQLocalProcessor {
	protected driver: SQLocalDriver;
	protected config: ProcessorConfig = {};
	protected userFunctions = new Map<string, UserFunction>();

	protected initMutex = createMutex();
	protected transactionMutex = createMutex();
	protected transactionKey: QueryKey | null = null;

	protected proxy: WorkerProxy;
	protected reinitChannel?: BroadcastChannel;

	onmessage?: (message: OutputMessage, transfer: Transferable[]) => void;

	constructor(driver: SQLocalDriver) {
		const isInWorker =
			typeof WorkerGlobalScope !== 'undefined' &&
			globalThis instanceof WorkerGlobalScope;
		const proxy = isInWorker ? coincident(globalThis) : globalThis;
		this.proxy = proxy as WorkerProxy;
		this.driver = driver;
	}

	protected init = async (reason: ConnectReason): Promise<void> => {
		if (!this.config.databasePath) return;

		await this.initMutex.lock();

		try {
			try {
				await this.driver.init(this.config);
			} catch {
				console.warn(
					`Persistence failed, so ${this.config.databasePath} will not be saved. For origin private file system persistence, make sure your web server is configured to use the correct HTTP response headers (See https://sqlocal.dev/guide/setup#cross-origin-isolation).`
				);
				this.config.databasePath = ':memory:';
				this.driver = new SQLiteMemoryDriver();
				await this.driver.init(this.config);
			}

			if (this.driver.storageType !== 'memory') {
				this.reinitChannel = new BroadcastChannel(
					`_sqlocal_reinit_(${this.config.databasePath})`
				);

				this.reinitChannel.onmessage = (
					event: MessageEvent<BroadcastMessage>
				) => {
					const message = event.data;
					if (this.config.clientKey === message.clientKey) return;

					switch (message.type) {
						case 'reinit':
							this.init(message.reason);
							break;
						case 'close':
							this.driver.destroy();
							break;
					}
				};
			}

			await Promise.all(
				Array.from(this.userFunctions.values()).map((fn) => {
					return this.initUserFunction(fn);
				})
			);

			await this.execInitStatements();
			this.emitMessage({ type: 'event', event: 'connect', reason });
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: null,
			});

			await this.destroy();
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
						const statementData = await this.driver.exec(message);
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
						const results = await this.driver.execBatch(message.statements);
						response.data.push(...results);
					} finally {
						await this.transactionMutex.unlock();
					}
					break;

				case 'transaction':
					if (message.action === 'begin') {
						await this.transactionMutex.lock();
						this.transactionKey = message.transactionKey;
						await this.driver.exec({ sql: 'BEGIN' });
					}

					if (
						(message.action === 'commit' || message.action === 'rollback') &&
						this.transactionKey !== null &&
						this.transactionKey === message.transactionKey
					) {
						const sql = message.action === 'commit' ? 'COMMIT' : 'ROLLBACK';
						await this.driver.exec({ sql });
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

	protected execInitStatements = async (): Promise<void> => {
		if (this.config.onInitStatements) {
			for (let statement of this.config.onInitStatements) {
				await this.driver.exec(statement);
			}
		}
	};

	protected getDatabaseInfo = async (
		message: GetInfoMessage
	): Promise<void> => {
		try {
			this.emitMessage({
				type: 'info',
				queryKey: message.queryKey,
				info: {
					databasePath: this.config.databasePath,
					storageType: this.driver.storageType,
					databaseSizeBytes: await this.driver.getDatabaseSizeBytes(),
					persisted: await this.driver.isDatabasePersisted(),
				},
			});
		} catch (error) {
			this.emitMessage({
				type: 'error',
				queryKey: message.queryKey,
				error,
			});
		}
	};

	protected createUserFunction = async (
		message: FunctionMessage
	): Promise<void> => {
		const { functionName: name, functionType: type, queryKey } = message;
		let fn: UserFunction;

		if (this.userFunctions.has(name)) {
			this.emitMessage({
				type: 'error',
				error: new Error(
					`A user-defined function with the name "${name}" has already been created for this SQLocal instance.`
				),
				queryKey,
			});
			return;
		}

		switch (type) {
			case 'callback':
				fn = {
					type,
					name,
					func: (...args: any[]) => {
						this.emitMessage({ type: 'callback', name, args });
					},
				};
				break;
			case 'scalar':
				fn = {
					type,
					name,
					func: this.proxy[`_sqlocal_func_${name}`],
				};
				break;
			case 'aggregate':
				fn = {
					type,
					name,
					func: {
						step: this.proxy[`_sqlocal_func_${name}_step`],
						final: this.proxy[`_sqlocal_func_${name}_final`],
					},
				};
				break;
		}

		try {
			await this.initUserFunction(fn);
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

	protected initUserFunction = async (fn: UserFunction): Promise<void> => {
		await this.driver.createFunction(fn);
		this.userFunctions.set(fn.name, fn);
	};

	protected importDb = async (message: ImportMessage): Promise<void> => {
		const { queryKey, database } = message;
		let errored = false;

		try {
			await this.driver.import(database);

			if (this.driver.storageType === 'memory') {
				await this.execInitStatements();
			}
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey,
			});
			errored = true;
		} finally {
			if (this.driver.storageType !== 'memory') {
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

	protected exportDb = async (message: ExportMessage): Promise<void> => {
		const { queryKey } = message;

		try {
			const { name, data } = await this.driver.export();

			this.emitMessage(
				{
					type: 'buffer',
					queryKey,
					bufferName: name,
					buffer: data,
				},
				[data]
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
		const { queryKey } = message;
		let errored = false;

		try {
			await this.driver.clear();
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

	protected destroy = async (message?: DestroyMessage): Promise<void> => {
		await this.driver.exec({ sql: 'PRAGMA optimize' });
		await this.driver.destroy();

		if (this.reinitChannel) {
			this.reinitChannel.close();
			this.reinitChannel = undefined;
		}

		if (message) {
			this.emitMessage({
				type: 'success',
				queryKey: message.queryKey,
			});
		}
	};
}
