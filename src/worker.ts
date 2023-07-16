import type {
	DataMessage,
	DestroyMessage,
	ErrorMessage,
	Message,
	QueryMessage,
	Sqlite3,
	Sqlite3Db,
	TransactionMessage,
	WorkerConfig,
} from './types';
// @ts-expect-error
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let sqlite3: Sqlite3 | undefined;
let db: Sqlite3Db | undefined;
const config: WorkerConfig = {};
const queuedQueries: (QueryMessage | TransactionMessage)[] = [];

self.onmessage = processMessageEvent;

function processMessageEvent(event: MessageEvent<Message>) {
	const message = event.data;

	switch (message.type) {
		case 'config':
			editConfig(message.key, message.value);
			break;
		case 'query':
		case 'transaction':
			execQuery(message);
			break;
		case 'destroy':
			destroy(message);
			break;
	}
}

function editConfig<T extends keyof WorkerConfig>(
	key: T,
	value: WorkerConfig[T]
) {
	if (config[key] === value) return;

	config[key] = value;

	if (key === 'databasePath') {
		flushQueue();
	}
}

function execQuery(message: QueryMessage | TransactionMessage) {
	if (!sqlite3 || !db || !config.databasePath) {
		queuedQueries.push(message);
		return;
	}

	try {
		const response: DataMessage = {
			type: 'data',
			queryKey: message.queryKey,
			rows: [],
			columns: [],
		};

		switch (message.type) {
			case 'query':
				const rows = db.exec({
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
				db.transaction((db: Sqlite3Db) => {
					for (let statement of message.statements) {
						db.exec({
							sql: statement.sql,
							bind: statement.params,
						});
					}
				});
				break;
		}

		postMessage(response satisfies DataMessage);
	} catch (error) {
		postMessage({
			type: 'error',
			error,
			queryKey: message.queryKey,
		} satisfies ErrorMessage);
	}
}

function flushQueue() {
	while (queuedQueries.length > 0) {
		const query = queuedQueries.shift();
		if (query === undefined) break;
		execQuery(query);
	}
}

function destroy(message: DestroyMessage) {
	db?.close();
	db = undefined;

	postMessage({
		type: 'destroy',
		queryKey: message.queryKey,
	} satisfies DestroyMessage);
}

async function init() {
	try {
		sqlite3 = await sqlite3InitModule();

		if ('opfs' in sqlite3) {
			db = new sqlite3.oo1.OpfsDb(config.databasePath);
		} else {
			db = new sqlite3.oo1.DB(config.databasePath);
			console.warn(
				`The origin private file system is not available, so ${config.databasePath} will not be persisted. Make sure your web server is configured to use the correct HTTP response headers (See https://www.npmjs.com/package/sqlocal#Install).`
			);
		}
	} catch (error) {
		postMessage({
			type: 'error',
			error,
			queryKey: null,
		} satisfies ErrorMessage);

		db?.close();
		db = undefined;
		return;
	}

	flushQueue();
}

init();
