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

export function createClient(database: string) {
	const worker = new Worker(new URL('./worker', import.meta.url), { type: 'module' });
	const queriesInProgress = new Map<
		QueryKey,
		[resolve: (message: DataMessage) => void, reject: (message: ErrorMessage) => void]
	>();

	const setDbMessage: ConfigMessage = { type: 'config', key: 'database', value: database };
	worker.postMessage(setDbMessage);

	worker.addEventListener('message', ({ data }: { data: Message }) => {
		switch (data.type) {
			case 'data':
			case 'error':
				if (data.queryKey && queriesInProgress.has(data.queryKey)) {
					const [resolve, reject] = queriesInProgress.get(data.queryKey)!;
					if (data.type === 'error') {
						reject(data);
					} else {
						resolve(data);
					}
					queriesInProgress.delete(data.queryKey);
				} else if (data.type === 'error') {
					console.error(data.error);
				}
				break;
		}
	});

	const exec = async (sql: string, params: any[], method: Sqlite3Method) => {
		const queryKey = uuidv4();
		const query = new Promise<DataMessage>((resolve, reject) => {
			queriesInProgress.set(queryKey, [resolve, reject]);
		});

		const message: QueryMessage = { type: 'query', queryKey, sql, params, method };
		worker.postMessage(message);

		const { rows, columns } = await query;
		return { rows, columns };
	};

	const sql = async (queryTemplate: TemplateStringsArray, ...params: any[]) => {
		const query = queryTemplate.join('?');
		const { rows, columns } = await exec(query, params, 'all');

		return rows.map((row) => {
			const rowObj: Record<string, any> = {};
			columns.forEach((column, columnIndex) => {
				rowObj[column] = row[columnIndex];
			});
			return rowObj;
		});
	};

	const getDatabaseFile = async () => {
		const opfs = await navigator.storage.getDirectory();
		const filehandle = await opfs.getFileHandle(database);
		return await filehandle.getFile();
	};

	return { exec, sql, getDatabaseFile };
}
