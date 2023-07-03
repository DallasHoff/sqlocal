import type { DataMessage, Message, QueryMessage, Sqlite3, Sqlite3Db, WorkerConfig } from './types';
// @ts-ignore
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let sqlite3: Sqlite3 | undefined;
const queuedQueries: QueryMessage[] = [];
const config: WorkerConfig = {};

self.onmessage = ({ data }: { data: Message }) => {
	switch (data.type) {
		case 'query':
			execQuery(data);
			break;
		case 'config':
			config[data.key] = data.value;
			break;
	}
};

function res(message: Message) {
	postMessage(message);
}

function execQuery(message: QueryMessage) {
	if (!sqlite3) {
		queuedQueries.push(message);
		return;
	}

	console.log('QUERY', message);

	let db: Sqlite3Db | undefined;

	try {
		if ('opfs' in sqlite3) {
			db = new sqlite3.oo1.OpfsDb(message.database);
		} else {
			db = new sqlite3.oo1.DB(message.database);
			console.warn(
				`The origin private file system is not available, so ${message.database} will not be persisted.`
			);
		}

		const columns = [] as string[];
		const rows = db.exec({
			sql: message.sql,
			bind: message.params,
			returnValue: 'resultRows',
			rowMode: 'array',
			columnNames: columns,
		});

		const response: DataMessage = {
			type: 'data',
			rows: [],
			columns,
			key: message.key,
		};
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
		res(response);
	} catch (error) {
		res({ type: 'error', error, key: message.key });
	} finally {
		db?.close();
	}
}

function flushQueue() {
	while (queuedQueries.length > 0) {
		const query = queuedQueries.shift();
		if (query === undefined) break;
		execQuery(query);
	}
}

async function init() {
	try {
		sqlite3 = await sqlite3InitModule();
		console.log('SQLite Ready');
		flushQueue();
	} catch (error) {
		res({ type: 'error', error, key: null });
	}
}

init();
