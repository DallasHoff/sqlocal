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
	const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
	const queriesInProgress = new Map<
		QueryKey,
		[(value: DataMessage) => void, (error: ErrorMessage) => void]
	>();

	const setDbMessage: ConfigMessage = { type: 'config', key: 'database', value: database };
	worker.postMessage(setDbMessage);

	worker.addEventListener('message', ({ data }: { data: Message }) => {
		switch (data.type) {
			case 'data':
			case 'error':
				if (data.key && queriesInProgress.has(data.key)) {
					const [resolve, reject] = queriesInProgress.get(data.key)!;
					if (data.type === 'error') {
						reject(data);
					} else {
						resolve(data);
					}
					queriesInProgress.delete(data.key);
				} else if (data.type === 'error') {
					console.error(data.error);
				}
				break;
		}
	});

	const getQueryKey = (): QueryKey => {
		return uuidv4();
	};

	const query = async (sql: string, params: any[], method: Sqlite3Method) => {
		const key = getQueryKey();
		const query = new Promise<DataMessage>((resolve, reject) => {
			queriesInProgress.set(key, [resolve, reject]);
		});
		const message: QueryMessage = { type: 'query', database, key, sql, params, method };
		worker.postMessage(message);
		const { rows, columns } = await query;
		return { rows, columns };
	};

	const sql = async (queryTemplate: TemplateStringsArray, ...bind: any[]) => {
		const { rows, columns } = await query(queryTemplate.join('?'), bind, 'all');
		return rows.map((row) => {
			const rowObj: Record<string, any> = {};
			columns.forEach((column, columnIndex) => {
				rowObj[column] = row[columnIndex];
			});
			return rowObj;
		});
	};

	return { query, sql };
}
