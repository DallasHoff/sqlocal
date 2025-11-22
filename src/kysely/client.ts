import {
	CompiledQuery,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from 'kysely';
import type { DatabaseConnection, Dialect, Driver, QueryResult } from 'kysely';
import { SQLocal } from '../index.js';
import type { Transaction } from '../types.js';

export class SQLocalKysely extends SQLocal {
	dialect: Dialect = {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new SQLocalKyselyDriver(this),
		createIntrospector: (db) => new SqliteIntrospector(db),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	};
}

class SQLocalKyselyDriver implements Driver {
	constructor(private client: SQLocalKysely) {}

	async init(): Promise<void> {}

	async acquireConnection(): Promise<SQLocalKyselyConnection> {
		return new SQLocalKyselyConnection(this.client);
	}

	async releaseConnection(): Promise<void> {}

	async beginTransaction(connection: SQLocalKyselyConnection): Promise<void> {
		connection.transaction = await this.client.beginTransaction();
	}

	async commitTransaction(connection: SQLocalKyselyConnection): Promise<void> {
		await connection.transaction?.commit();
		connection.transaction = null;
	}

	async rollbackTransaction(
		connection: SQLocalKyselyConnection
	): Promise<void> {
		await connection.transaction?.rollback();
		connection.transaction = null;
	}

	async destroy(): Promise<void> {
		await this.client.destroy();
	}
}

class SQLocalKyselyConnection implements DatabaseConnection {
	transaction: Transaction | null = null;

	constructor(private client: SQLocalKysely) {}

	async executeQuery<Result>(
		query: CompiledQuery
	): Promise<QueryResult<Result>> {
		let rows;
		let affectedRows: number | undefined;

		if (this.transaction === null) {
			const result = await this.client.execSql(query.sql, ...query.parameters);
			rows = result.rows;
			affectedRows = result.affectedRows;
		} else {
			rows = await this.transaction.query(query);
			affectedRows = this.transaction.lastAffectedRows;
		}

		return {
			rows: rows as Result[],
			numAffectedRows:
				affectedRows !== undefined ? BigInt(affectedRows) : undefined,
		};
	}

	async *streamQuery(): AsyncGenerator<never, void, unknown> {
		throw new Error('SQLite3 does not support streaming.');
	}
}
