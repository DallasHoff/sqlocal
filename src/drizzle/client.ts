import { SQLocal } from '..';
import type { Sqlite3Method } from '../types';

export class SQLocalDrizzle extends SQLocal {
	constructor(databasePath: string) {
		super(databasePath);
	}

	driver = async (sql: string, params: any[], method: Sqlite3Method) => {
		return await this.exec(sql, params, method);
	};
}
