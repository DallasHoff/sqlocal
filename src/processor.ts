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
	RawResultData,
} from './types.js';

export class SQLocalProcessor {
	protected proxy: WorkerProxy;
	protected sqlite3: Sqlite3 | undefined;
	protected db: Sqlite3Db | undefined;
	protected config: ProcessorConfig = {};
	protected queuedMessages: InputMessage[] = [];
	protected userFunctions = new Map<string, UserFunction>();

	onmessage: ((message: OutputMessage) => void) | undefined;

	constructor(worker: typeof globalThis) {
		this.proxy = coincident(worker) as WorkerProxy;
		this.init();
	}

	protected init = async () => {
		if (!this.config.databasePath) return;

		try {
			if (!this.sqlite3) {
				this.sqlite3 = await sqlite3InitModule();
			}

			if (this.db) {
				this.db?.close();
				this.db = undefined;
			}

			if ('opfs' in this.sqlite3) {
				this.db = new this.sqlite3.oo1.OpfsDb(this.config.databasePath, 'cw');
			} else {
				this.db = new this.sqlite3.oo1.DB(this.config.databasePath, 'cw');
				console.warn(
					`The origin private file system is not available, so ${this.config.databasePath} will not be persisted. Make sure your web server is configured to use the correct HTTP response headers (See https://sqlocal.dallashoffman.com/guide/setup#cross-origin-isolation).`
				);
			}
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: null,
			});

			this.db?.close();
			this.db = undefined;
			return;
		}

		this.userFunctions.forEach(this.initUserFunction);
		this.flushQueue();
	};

	postMessage = (message: InputMessage | MessageEvent<InputMessage>) => {
		if (message instanceof MessageEvent) {
			message = message.data;
		}

		if (!this.db && message.type !== 'config') {
			this.queuedMessages.push(message);
			return;
		}

		switch (message.type) {
			case 'config':
				this.editConfig(message.key, message.value);
				break;
			case 'query':
			case 'batch':
				this.exec(message);
				break;
			case 'function':
				this.createUserFunction(message);
				break;
			case 'import':
				this.importDb(message);
				break;
			case 'destroy':
				this.destroy(message);
				break;
		}
	};

	protected emitMessage = (message: OutputMessage) => {
		if (this.onmessage) {
			this.onmessage(message);
		}
	};

	protected editConfig = <T extends keyof ProcessorConfig>(
		key: T,
		value: ProcessorConfig[T]
	) => {
		if (this.config[key] === value) return;

		this.config[key] = value;

		if (key === 'databasePath') {
			this.init();
		}
	};

	protected exec = (message: QueryMessage | BatchMessage) => {
		if (!this.db) return;

		try {
			const response: DataMessage = {
				type: 'data',
				queryKey: message.queryKey,
				data: [],
			};

			switch (message.type) {
				case 'query':
					const statementData: RawResultData = {
						rows: [],
						columns: [],
					};
					const rows = this.db.exec({
						sql: message.sql,
						bind: message.params as any[],
						returnValue: 'resultRows',
						rowMode: 'array',
						columnNames: statementData.columns,
					});

					switch (message.method) {
						case 'run':
							break;
						case 'get':
							statementData.rows = rows[0];
							break;
						case 'all':
						default:
							statementData.rows = rows;
							break;
					}

					response.data.push(statementData);
					break;

				case 'batch':
					this.db.transaction((tx: Sqlite3Db) => {
						for (let statement of message.statements) {
							const statementData: RawResultData = {
								rows: [],
								columns: [],
							};
							const rows = tx.exec({
								sql: statement.sql,
								bind: statement.params as any[],
								returnValue: 'resultRows',
								rowMode: 'array',
								columnNames: statementData.columns,
							});

							switch (statement.method) {
								case 'run':
									break;
								case 'get':
									statementData.rows = rows[0];
									break;
								case 'all':
								default:
									statementData.rows = rows;
									break;
							}

							response.data.push(statementData);
						}
					});
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

	protected createUserFunction = (message: FunctionMessage) => {
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

	protected initUserFunction = (fn: UserFunction) => {
		if (!this.db) return;

		this.db.createFunction({
			name: fn.name,
			xFunc: (_: number, ...args: any[]) => fn.func(...args),
			arity: -1,
		});

		this.userFunctions.set(fn.name, fn);
	};

	protected importDb = async (message: ImportMessage) => {
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

	protected flushQueue = () => {
		while (this.queuedMessages.length > 0) {
			const message = this.queuedMessages.shift();
			if (message === undefined) continue;
			this.postMessage(message);
		}
	};

	protected destroy = (message: DestroyMessage) => {
		this.db?.close();
		this.db = undefined;

		this.emitMessage({
			type: 'success',
			queryKey: message.queryKey,
		});
	};
}
