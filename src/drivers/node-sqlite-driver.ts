// @ts-expect-error
import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs/promises';
import { parseDatabasePath } from '../lib/parse-database-path.js';
import type {
	DriverConfig,
	DriverStatement,
	RawResultData,
	Sqlite3StorageType,
	SQLocalDriver,
	UserFunction,
} from '../types.js';
import { getStorageScheme } from '../lib/get-storage-scheme.js';

export class NodeSQLiteDriver implements SQLocalDriver {
	protected db?: DatabaseSync;
	protected config?: DriverConfig;

	readonly storageType: Sqlite3StorageType = 'node';

	async init(config: DriverConfig): Promise<void> {
		const { databasePath } = config;

		if (!databasePath) {
			throw new Error('No databasePath specified');
		}

		if (getStorageScheme(databasePath) === 'web-storage') {
			throw new Error(
				'The Node SQLite driver does not support Web Storage persistence.'
			);
		}

		if (this.db) {
			await this.destroy();
		}

		this.db = new DatabaseSync(databasePath, {
			// @ts-expect-error
			readOnly: !!config.readOnly,
		});
		this.config = config;
	}

	protected execSync(statement: DriverStatement): RawResultData {
		if (!this.db) throw new Error('Driver not initialized');

		const method =
			!statement.method || statement.method === 'values'
				? 'all'
				: statement.method;
		const params = statement.params ?? [];

		const stmt = this.db.prepare(statement.sql);
		const data = stmt[method](...params);

		const statementData: RawResultData = {
			rows: [],
			columns: [],
		};

		if (method === 'get') {
			statementData.columns = data ? Object.keys(data) : [];
			statementData.rows = data ? Object.values(data) : [];
		} else if (method === 'all') {
			statementData.columns = Array.isArray(data)
				? Object.keys(data?.[0] ?? {})
				: [];
			statementData.rows = Array.isArray(data)
				? data.map((row) => Object.values(row))
				: [];
		}

		return statementData;
	}

	async exec(statement: DriverStatement): Promise<RawResultData> {
		return this.execSync(statement);
	}

	protected execBatchSync(statements: DriverStatement[]): RawResultData[] {
		const results: RawResultData[] = [];
		let startedTransaction = false;

		try {
			this.execSync({ sql: 'BEGIN', method: 'run' });
			startedTransaction = true;

			for (let statement of statements) {
				const result = this.execSync(statement);
				results.push(result);
			}

			this.execSync({ sql: 'COMMIT', method: 'run' });
		} catch {
			if (startedTransaction) {
				this.execSync({ sql: 'ROLLBACK', method: 'run' });
				return [];
			}
		}

		return results;
	}

	async execBatch(statements: DriverStatement[]): Promise<RawResultData[]> {
		return this.execBatchSync(statements);
	}

	async isDatabasePersisted(): Promise<boolean> {
		const { databasePath } = this.config ?? {};
		return !!databasePath && databasePath !== ':memory:';
	}

	async getDatabaseSizeBytes(): Promise<number> {
		const sizeResult = this.execSync({
			sql: `SELECT page_count * page_size AS size 
				FROM pragma_page_count(), pragma_page_size()`,
			method: 'get',
		});
		const size = sizeResult?.rows?.[0];

		if (typeof size !== 'number') {
			throw new Error('Failed to query database size');
		}

		return size;
	}

	async createFunction(fn: UserFunction): Promise<void> {
		if (!this.db) throw new Error('Driver not initialized');

		switch (fn.type) {
			case 'callback':
			case 'scalar':
				// @ts-expect-error
				this.db.function(
					fn.name,
					{ varargs: true },
					(_: number, ...args: any[]) => fn.func(...args)
				);
				break;
			case 'aggregate':
				// TODO
				break;
		}
	}

	async import(
		database: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
	): Promise<void> {
		if (!this.db || !this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}

		if (database instanceof ReadableStream) {
			// const file = await fs.open(this.config.databasePath);
			// TODO
		} else {
			await fs.writeFile(this.config.databasePath, Buffer.from(database));
		}
	}

	async export(): Promise<{
		name: string;
		data: ArrayBuffer | Uint8Array;
	}> {
		if (!this.db || !this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}

		const path = parseDatabasePath(this.config.databasePath);
		const name = path.fileName;
		const tempFileName = `backup-${Date.now()}--${name}`;
		const tempFilePath = `${path.directories.join('/')}/${tempFileName}`;

		await backup(this.db, tempFilePath);
		const data = await fs.readFile(tempFilePath);
		await fs.unlink(tempFilePath);

		return { name, data };
	}

	async clear(): Promise<void> {
		if (!this.config?.databasePath) throw new Error('Driver not initialized');

		await this.destroy();

		const { directories, fileName, tempFileNames } = parseDatabasePath(
			this.config.databasePath
		);
		const dir = directories.join('/');
		const fileNames = [fileName, ...tempFileNames];

		await Promise.all(
			fileNames.map((name) => {
				return fs.unlink(`${dir}/${name}`).catch((err) => {
					if (err.code !== 'ENOENT') {
						throw err;
					}
				});
			})
		);
	}

	async destroy(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = undefined;
		}
	}
}
