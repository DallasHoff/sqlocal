import { SQLocal } from '../index.js';
import {
	CompiledQuery,
	DatabaseConnection,
	Dialect,
	Driver,
	QueryResult,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from 'kysely';

export class SQLocalKysely extends SQLocal {
	dialect: Dialect = {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new SQLocalKyselyDriver(this),
		createIntrospector: (db) => new SqliteIntrospector(db),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	};
}

class SQLocalKyselyDriver implements Driver {
	private client: SQLocalKysely;

	constructor(client: SQLocalKysely) {
		this.client = client;
	}

	async init(): Promise<void> {}

	async acquireConnection(): Promise<SQLocalKyselyConnection> {
		return new SQLocalKyselyConnection(this.client);
	}

	async releaseConnection(): Promise<void> {}

	async beginTransaction(connection: SQLocalKyselyConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw('BEGIN'));
	}

	async commitTransaction(connection: SQLocalKyselyConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw('COMMIT'));
	}

	async rollbackTransaction(
		connection: SQLocalKyselyConnection
	): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw('ROLLBACK'));
	}

	async destroy(): Promise<void> {
		await this.client.destroy();
	}
}

class SQLocalKyselyConnection implements DatabaseConnection {
	private client: SQLocalKysely;

	constructor(client: SQLocalKysely) {
		this.client = client;
	}

	async executeQuery<Result>(
		query: CompiledQuery
	): Promise<QueryResult<Result>> {
		const rows = await this.client.sql(query.sql, ...query.parameters);

		return {
			rows: rows as Result[],
		};
	}

	async *streamQuery(): AsyncGenerator<never, void, unknown> {
		throw new Error('SQLite3 does not support streaming.');
	}
}
