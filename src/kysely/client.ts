import { SQLocal } from '..';
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
	private executor = async <T>(query: CompiledQuery) => {
		const { rows, columns } = await this.exec(
			query.sql,
			query.parameters as any[],
			'all'
		);
		return {
			rows: this.convertRowsToObjects(rows, columns) as T[],
		} satisfies QueryResult<T>;
	};

	dialect = {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new SQLocalKyselyDriver(this, this.executor),
		createIntrospector: (db) => new SqliteIntrospector(db),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	} satisfies Dialect;
}

class SQLocalKyselyDriver implements Driver {
	private client: SQLocalKysely;
	private executor: SQLocalKysely['executor'];

	constructor(client: SQLocalKysely, executor: SQLocalKysely['executor']) {
		this.client = client;
		this.executor = executor;
	}

	async acquireConnection() {
		return new SQLocalKyselyConnection(this.executor);
	}

	async beginTransaction(connection: DatabaseConnection) {
		await connection.executeQuery(CompiledQuery.raw('BEGIN'));
	}

	async commitTransaction(connection: DatabaseConnection) {
		await connection.executeQuery(CompiledQuery.raw('COMMIT'));
	}

	async rollbackTransaction(connection: DatabaseConnection) {
		await connection.executeQuery(CompiledQuery.raw('ROLLBACK'));
	}

	async destroy() {
		await this.client.destroy();
	}

	async init() {}
	async releaseConnection() {}
}

class SQLocalKyselyConnection implements DatabaseConnection {
	private executor: SQLocalKysely['executor'];

	constructor(executor: SQLocalKysely['executor']) {
		this.executor = executor;
	}

	async executeQuery<T>(query: CompiledQuery) {
		return await this.executor<T>(query);
	}

	async *streamQuery() {
		throw new Error('SQLite3 does not support streaming.');
	}
}
