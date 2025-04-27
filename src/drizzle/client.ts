import { SQLocal } from '../index.js';
import type { RawResultData, Sqlite3Method } from '../types.js';

export class SQLocalDrizzle extends SQLocal {
	driver = async (
		sql: string,
		params: unknown[],
		method: Sqlite3Method
	): Promise<RawResultData> => {
		if (
			/^begin\b/i.test(sql) &&
			typeof globalThis.sessionStorage !== 'undefined' &&
			!sessionStorage._sqlocal_sent_drizzle_transaction_warning
		) {
			console.warn(
				"Drizzle's transaction method cannot isolate transactions from outside queries. It is recommended to use the transaction method of SQLocalDrizzle instead (See https://sqlocal.dev/api/transaction#drizzle)."
			);
			sessionStorage._sqlocal_sent_drizzle_transaction_warning = '1';
		}
		return this.exec(sql, params, method);
	};

	batchDriver = async (
		queries: { sql: string; params: unknown[]; method: Sqlite3Method }[]
	): Promise<RawResultData[]> => {
		return this.execBatch(queries);
	};
}
