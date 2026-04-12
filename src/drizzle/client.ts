import { SQLocal } from '../index.js';
import type { RawResultData, Sqlite3Method } from '../types.js';

/**
 * A subclass of the `SQLocal` client that provides additional methods
 * for using SQLocal as a driver for Drizzle ORM.
 * @see {@link https://sqlocal.dev/drizzle/setup}
 */
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
		const transactionKey = this.transactionQueryKeyQueue.shift();
		return this.exec(sql, params, method, transactionKey);
	};

	batchDriver = async (
		queries: { sql: string; params: unknown[]; method: Sqlite3Method }[]
	): Promise<RawResultData[]> => {
		return this.execBatch(queries);
	};
}
