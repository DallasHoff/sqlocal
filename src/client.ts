import { nanoid } from 'nanoid';
import type {
	ConfigMessage,
	DestroyMessage,
	Message,
	OmitQueryKey,
	QueryKey,
	QueryMessage,
	Sqlite3Method,
	TransactionMessage,
} from './types';

export class SQLocal {
	protected worker: Worker;
	protected databasePath: string;
	protected queriesInProgress = new Map<
		QueryKey,
		[resolve: (message: Message) => void, reject: (error: unknown) => void]
	>();

	constructor(databasePath: string) {
		this.worker = new Worker(new URL('./worker', import.meta.url), { type: 'module' });

		this.worker.addEventListener('message', this.processMessageEvent);

		this.databasePath = databasePath;
		this.worker.postMessage({
			type: 'config',
			key: 'databasePath',
			value: databasePath,
		} satisfies ConfigMessage);
	}

	protected processMessageEvent = (event: MessageEvent<Message>) => {
		const message = event.data;
		const queries = this.queriesInProgress;

		switch (message.type) {
			case 'data':
			case 'error':
				if (message.queryKey && queries.has(message.queryKey)) {
					const [resolve, reject] = queries.get(message.queryKey)!;
					if (message.type === 'error') {
						reject(message.error);
					} else {
						resolve(message);
					}
					queries.delete(message.queryKey);
				} else if (message.type === 'error') {
					throw message.error;
				}
				break;

			case 'destroy':
				if (message.queryKey && queries.has(message.queryKey)) {
					const [resolve] = queries.get(message.queryKey)!;
					resolve(message);
					queries.delete(message.queryKey);
				}
				break;
		}
	};

	protected createQuery = (
		message: OmitQueryKey<QueryMessage | TransactionMessage | DestroyMessage>
	) => {
		const queryKey = nanoid() satisfies QueryKey;

		this.worker.postMessage({
			...message,
			queryKey,
		} satisfies QueryMessage | TransactionMessage | DestroyMessage);

		return new Promise<Message>((resolve, reject) => {
			this.queriesInProgress.set(queryKey, [resolve, reject]);
		});
	};

	protected convertSqlTemplate = (queryTemplate: TemplateStringsArray, ...params: any[]) => {
		return {
			sql: queryTemplate.join('?'),
			params,
		};
	};

	protected convertRowsToObjects = (rows: any[], columns: string[]) => {
		return rows.map((row) => {
			const rowObj = {} as Record<string, any>;
			columns.forEach((column, columnIndex) => {
				rowObj[column] = row[columnIndex];
			});
			return rowObj;
		});
	};

	protected exec = async (sql: string, params: any[], method: Sqlite3Method) => {
		const message = await this.createQuery({
			type: 'query',
			sql,
			params,
			method,
		});

		let data = {
			rows: [] as any[],
			columns: [] as string[],
		};

		if (message.type === 'data') {
			data.rows = message.rows;
			data.columns = message.columns;
		}

		return data;
	};

	sql = async <T extends Record<string, any>[]>(
		queryTemplate: TemplateStringsArray,
		...params: any[]
	) => {
		const statement = this.convertSqlTemplate(queryTemplate, ...params);
		const { rows, columns } = await this.exec(statement.sql, statement.params, 'all');
		return this.convertRowsToObjects(rows, columns) as T;
	};

	transaction = async (
		passStatements: (
			sql: SQLocal['convertSqlTemplate']
		) => ReturnType<SQLocal['convertSqlTemplate']>[]
	) => {
		const statements = passStatements(this.convertSqlTemplate);
		await this.createQuery({
			type: 'transaction',
			statements,
		});
	};

	getDatabaseFile = async () => {
		const opfs = await navigator.storage.getDirectory();
		const fileHandle = await opfs.getFileHandle(this.databasePath);
		return await fileHandle.getFile();
	};

	overwriteDatabaseFile = async (databaseFile: FileSystemWriteChunkType) => {
		const opfs = await navigator.storage.getDirectory();
		const fileHandle = await opfs.getFileHandle(this.databasePath, { create: true });
		const fileWritable = await fileHandle.createWritable();
		await fileWritable.truncate(0);
		await fileWritable.write(databaseFile);
		await fileWritable.close();
	};

	destroy = async () => {
		await this.createQuery({ type: 'destroy' });
		this.worker.removeEventListener('message', this.processMessageEvent);
		this.queriesInProgress.clear();
		this.worker.terminate();
	};
}
