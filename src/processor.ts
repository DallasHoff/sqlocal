import type {
	DataMessage,
	DestroyMessage,
	ErrorMessage,
	CallbackMessage,
	Message,
	QueryMessage,
	Sqlite3,
	Sqlite3Db,
	TransactionMessage,
	WorkerConfig,
} from './types';
// @ts-expect-error
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

export class SQLocalProcessor {
	protected sqlite3: Sqlite3 | undefined;
	protected db: Sqlite3Db | undefined;
	protected config: WorkerConfig = {};
	protected queuedMessages: Message[] = [];
	protected messageListeners = new Set<(message: Message) => void>();

	constructor() {
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
				this.db = new this.sqlite3.oo1.OpfsDb(this.config.databasePath);
			} else {
				this.db = new this.sqlite3.oo1.DB(this.config.databasePath);
				console.warn(
					`The origin private file system is not available, so ${this.config.databasePath} will not be persisted. Make sure your web server is configured to use the correct HTTP response headers (See https://sqlocal.dallashoffman.com/guide/setup#cross-origin-isolation).`
				);
			}
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: null,
			} satisfies ErrorMessage);

			this.db?.close();
			this.db = undefined;
			return;
		}

		this.flushQueue();
	};

	processMessage = (message: Message | MessageEvent<Message>) => {
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
			case 'transaction':
				this.exec(message);
				break;
			case 'callback':
				this.createCallbackFunction(message);
				break;
			case 'destroy':
				this.destroy(message);
				break;
		}
	};

	addMessageListener = (listener: (message: Message) => void) => {
		this.messageListeners.add(listener);
	};

	removeMessageListener = (listener: (message: Message) => void) => {
		this.messageListeners.delete(listener);
	};

	protected emitMessage = (message: Message) => {
		this.messageListeners.forEach((listener) => {
			listener(message);
		});
	};

	protected editConfig = <T extends keyof WorkerConfig>(
		key: T,
		value: WorkerConfig[T]
	) => {
		if (this.config[key] === value) return;

		this.config[key] = value;

		if (key === 'databasePath') {
			this.init();
		}
	};

	protected exec = (message: QueryMessage | TransactionMessage) => {
		try {
			const response: DataMessage = {
				type: 'data',
				queryKey: message.queryKey,
				rows: [],
				columns: [],
			};

			switch (message.type) {
				case 'query':
					const rows = this.db.exec({
						sql: message.sql,
						bind: message.params,
						returnValue: 'resultRows',
						rowMode: 'array',
						columnNames: response.columns,
					});

					switch (message.method) {
						case 'run':
							break;
						case 'get':
							response.rows = rows[0];
							break;
						case 'all':
						default:
							response.rows = rows;
							break;
					}
					break;

				case 'transaction':
					this.db.transaction((db: Sqlite3Db) => {
						for (let statement of message.statements) {
							db.exec({
								sql: statement.sql,
								bind: statement.params,
							});
						}
					});
					break;
			}

			this.emitMessage(response satisfies DataMessage);
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: message.queryKey,
			} satisfies ErrorMessage);
		}
	};

	protected createCallbackFunction = (message: CallbackMessage) => {
		const handler = (_: number, ...args: any[]) => {
			this.emitMessage({
				type: 'callback',
				name: message.name,
				args: args,
			} satisfies CallbackMessage);
		};

		try {
			this.db.createFunction(message.name, handler, { arity: -1 });
		} catch (error) {
			this.emitMessage({
				type: 'error',
				error,
				queryKey: null,
			} satisfies ErrorMessage);
		}
	};

	protected flushQueue = () => {
		while (this.queuedMessages.length > 0) {
			const message = this.queuedMessages.shift();
			if (message === undefined) continue;
			this.processMessage(message);
		}
	};

	protected destroy = (message: DestroyMessage) => {
		this.db?.close();
		this.db = undefined;

		this.emitMessage({
			type: 'destroy',
			queryKey: message.queryKey,
		} satisfies DestroyMessage);
	};
}
