import { SQLocal } from '../index.js';
import type { Sqlite3Method } from '../types.js';

export class SQLocalDrizzle extends SQLocal {
	driver = async (sql: string, params: unknown[], method: Sqlite3Method) => {
		return await this.exec(sql, params, method);
	};

	batchDriver = async (
		queries: { sql: string; params: unknown[]; method: Sqlite3Method }[]
	) => {
		return await this.execBatch(queries);
	};
}
