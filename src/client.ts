import { v4 as uuidv4 } from 'uuid';
import type {
	ConfigMessage,
	DataMessage,
	ErrorMessage,
	Message,
	QueryKey,
	QueryMessage,
	Sqlite3Method,
} from './types';

export class SQLocal {
	worker: Worker;
	database: string;
	queriesInProgress = new Map<
		QueryKey,
		[resolve: (message: DataMessage) => void, reject: (message: ErrorMessage) => void]
	>();

	constructor(database: string) {
		this.worker = new Worker(new URL('./worker', import.meta.url), { type: 'module' });

		this.database = database;
		this.worker.postMessage({
			type: 'config',
			key: 'database',
			value: database,
		} as ConfigMessage);

		this.worker.addEventListener('message', ({ data: message }: { data: Message }) => {
			switch (message.type) {
				case 'data':
				case 'error':
					if (message.queryKey && this.queriesInProgress.has(message.queryKey)) {
						const [resolve, reject] = this.queriesInProgress.get(message.queryKey)!;
						if (message.type === 'error') {
							reject(message);
						} else {
							resolve(message);
						}
						this.queriesInProgress.delete(message.queryKey);
					} else if (message.type === 'error') {
						console.error(message.error);
					}
					break;
			}
		});
	}

	sql = async (queryTemplate: TemplateStringsArray, ...params: any[]) => {
		const query = queryTemplate.join('?');
		const { rows, columns } = await this.driver(query, params, 'all');

		return rows.map((row) => {
			const rowObj: Record<string, any> = {};
			columns.forEach((column, columnIndex) => {
				rowObj[column] = row[columnIndex];
			});
			return rowObj;
		});
	};

	async driver(sql: string, params: any[], method: Sqlite3Method) {
		const queryKey = uuidv4();
		const query = new Promise<DataMessage>((resolve, reject) => {
			this.queriesInProgress.set(queryKey, [resolve, reject]);
		});

		const message: QueryMessage = { type: 'query', queryKey, sql, params, method };
		this.worker.postMessage(message);

		const { rows, columns } = await query;
		return { rows, columns };
	}

	async getDatabaseFile() {
		const opfs = await navigator.storage.getDirectory();
		const filehandle = await opfs.getFileHandle(this.database);
		return await filehandle.getFile();
	}
}
