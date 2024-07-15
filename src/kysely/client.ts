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
import { convertRowsToObjects } from '../lib/convert-rows-to-objects.js';

export class SQLocalKysely extends SQLocal {
	private executor = async <T>(
		query: CompiledQuery
	): Promise<QueryResult<T>> => {
		const { rows, columns } = await this.exec(
			query.sql,
			query.parameters as unknown[],
			'all'
		);
		return {
			rows: convertRowsToObjects(rows, columns) as T[],
		};
	};

	dialect: Dialect = {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new SQLocalKyselyDriver(this, this.executor),
		createIntrospector: (db) => new SqliteIntrospector(db),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	};
}

class SQLocalKyselyDriver implements Driver {
	private client: SQLocalKysely;
	private executor: SQLocalKysely['executor'];

	constructor(client: SQLocalKysely, executor: SQLocalKysely['executor']) {
		this.client = client;
		this.executor = executor;
	}

	async acquireConnection(): Promise<SQLocalKyselyConnection> {
		return new SQLocalKyselyConnection(this.executor);
	}

	async beginTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw('BEGIN'));
	}

	async commitTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw('COMMIT'));
	}

	async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw('ROLLBACK'));
	}

	async destroy(): Promise<void> {
		await this.client.destroy();
	}

	async init(): Promise<void> {}
	async releaseConnection(): Promise<void> {}
}

class SQLocalKyselyConnection implements DatabaseConnection {
	private executor: SQLocalKysely['executor'];

	constructor(executor: SQLocalKysely['executor']) {
		this.executor = executor;
	}

	async executeQuery<T>(query: CompiledQuery): Promise<QueryResult<T>> {
		return await this.executor<T>(query);
	}

	async *streamQuery(): AsyncGenerator<never, void, unknown> {
		throw new Error('SQLite3 does not support streaming.');
	}
}
