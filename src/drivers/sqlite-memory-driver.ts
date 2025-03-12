import type {
	DriverConfig,
	DriverStatement,
	RawResultData,
	Sqlite3,
	Sqlite3Db,
	Sqlite3InitModule,
	Sqlite3StorageType,
	SQLocalDriver,
	UserFunction,
} from '../types.js';
import { normalizeDatabaseFile } from '../lib/normalize-database-file.js';

export class SQLiteMemoryDriver implements SQLocalDriver {
	protected sqlite3?: Sqlite3;
	protected db?: Sqlite3Db;
	protected config?: DriverConfig;
	protected pointers: number[] = [];

	readonly storageType: Sqlite3StorageType = 'memory';

	constructor(protected sqlite3InitModule?: Sqlite3InitModule) {}

	async init(config: DriverConfig): Promise<void> {
		const { databasePath } = config;
		const flags = this.getFlags(config);

		if (!this.sqlite3InitModule) {
			const { default: sqlite3InitModule } = await import(
				'@sqlite.org/sqlite-wasm'
			);
			this.sqlite3InitModule = sqlite3InitModule;
		}

		if (!this.sqlite3) {
			this.sqlite3 = await this.sqlite3InitModule();
		}

		if (this.db) {
			await this.destroy();
		}

		this.db = new this.sqlite3.oo1.DB(databasePath, flags);
		this.config = config;
	}

	async exec(statement: DriverStatement): Promise<RawResultData> {
		if (!this.db) throw new Error('Driver not initialized');

		return this.execOnDb(this.db, statement);
	}

	async execBatch(statements: DriverStatement[]): Promise<RawResultData[]> {
		if (!this.db) throw new Error('Driver not initialized');

		const results: RawResultData[] = [];

		this.db.transaction((tx) => {
			for (let statement of statements) {
				const statementData = this.execOnDb(tx, statement);
				results.push(statementData);
			}
		});

		return results;
	}

	async isDatabasePersisted(): Promise<boolean> {
		return false;
	}

	async getDatabaseSizeBytes(): Promise<number> {
		const sizeResult = await this.exec({
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
				this.db.createFunction({
					name: fn.name,
					xFunc: (_: number, ...args: any[]) => fn.func(...args),
					arity: -1,
				});
				break;
			case 'aggregate':
				this.db.createFunction({
					name: fn.name,
					xStep: (_: number, ...args: any[]) => fn.func.step(...args),
					xFinal: (_: number, ...args: any[]) => fn.func.final(...args),
					arity: -1,
				});
				break;
		}
	}

	async import(
		database: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
	): Promise<void> {
		if (!this.sqlite3 || !this.db || !this.config) {
			throw new Error('Driver not initialized');
		}

		const data = await normalizeDatabaseFile(database, 'buffer');
		const dataPointer = this.sqlite3.wasm.allocFromTypedArray(data);
		this.pointers.push(dataPointer);
		const resultCode = this.sqlite3.capi.sqlite3_deserialize(
			this.db,
			'main',
			dataPointer,
			data.byteLength,
			data.byteLength,
			this.config.readOnly
				? this.sqlite3.capi.SQLITE_DESERIALIZE_READONLY
				: this.sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
		);
		this.db.checkRc(resultCode);
	}

	async export(): Promise<{
		name: string;
		data: ArrayBuffer | Uint8Array;
	}> {
		if (!this.sqlite3 || !this.db) {
			throw new Error('Driver not initialized');
		}

		return {
			name: 'database.sqlite3',
			data: this.sqlite3.capi.sqlite3_js_db_export(this.db),
		};
	}

	async clear(): Promise<void> {}

	async destroy(): Promise<void> {
		this.closeDb();
		this.pointers.forEach((pointer) => this.sqlite3?.wasm.dealloc(pointer));
		this.pointers = [];
	}

	protected getFlags(config: DriverConfig): string {
		const { readOnly, verbose } = config;
		const parts = [readOnly === true ? 'r' : 'cw', verbose === true ? 't' : ''];
		return parts.join('');
	}

	protected execOnDb(db: Sqlite3Db, statement: DriverStatement): RawResultData {
		const statementData: RawResultData = {
			rows: [],
			columns: [],
		};

		const rows = db.exec({
			sql: statement.sql,
			bind: statement.params,
			returnValue: 'resultRows',
			rowMode: 'array',
			columnNames: statementData.columns,
		});

		switch (statement.method) {
			case 'run':
				break;
			case 'get':
				statementData.rows = rows[0] ?? [];
				break;
			case 'all':
			default:
				statementData.rows = rows;
				break;
		}

		return statementData;
	}

	protected closeDb(): void {
		if (this.db) {
			this.db.close();
			this.db = undefined;
		}
	}
}
