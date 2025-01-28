import type { JsStorageDb } from '@sqlite.org/sqlite-wasm';
import type {
	DriverConfig,
	Sqlite3InitModule,
	SQLocalDriver,
} from '../types.js';
import { SQLiteMemoryDriver } from './sqlite-memory-driver.js';

export class SQLiteKvvfsDriver
	extends SQLiteMemoryDriver
	implements SQLocalDriver
{
	declare protected db?: JsStorageDb;

	constructor(
		override readonly storageType: 'local' | 'session',
		sqlite3InitModule?: Sqlite3InitModule
	) {
		super(sqlite3InitModule);
	}

	override async init(config: DriverConfig): Promise<void> {
		const flags = this.getFlags(config);

		if (config.readOnly) {
			throw new Error(
				`SQLite storage type "${this.storageType}" does not support read-only mode.`
			);
		}

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

		this.db = new this.sqlite3.oo1.JsStorageDb({
			filename: this.storageType,
			flags,
		});
		this.config = config;
	}

	override async isDatabasePersisted(): Promise<boolean> {
		return navigator.storage?.persisted();
	}

	override async getDatabaseSizeBytes(): Promise<number> {
		if (!this.db) throw new Error('Driver not initialized');

		return this.db.storageSize();
	}

	override async import(
		database: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
	): Promise<void> {
		const memdb = new SQLiteMemoryDriver();
		await memdb.init({});
		await memdb.import(database);
		await this.clear();
		await memdb.exec({
			sql: `VACUUM INTO 'file:${this.storageType}?vfs=kvvfs'`,
		});
		await memdb.destroy();
	}

	override async clear(): Promise<void> {
		if (!this.db) throw new Error('Driver not initialized');

		this.db.clearStorage();
	}

	override async destroy(): Promise<void> {
		this.closeDb();
	}
}
