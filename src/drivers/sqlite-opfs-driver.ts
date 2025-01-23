import type {
	DriverConfig,
	Sqlite3StorageType,
	SQLocalDriver,
} from '../types.js';
import { normalizeDatabaseFile } from '../lib/normalize-database-file.js';
import { parseDatabasePath } from '../lib/parse-database-path.js';
import { SQLiteMemoryDriver } from './sqlite-memory-driver.js';

export class SQLiteOpfsDriver
	extends SQLiteMemoryDriver
	implements SQLocalDriver
{
	override readonly storageType: Sqlite3StorageType = 'opfs';

	override async init(config: DriverConfig): Promise<void> {
		const { databasePath } = config;
		const flags = this.getFlags(config);

		if (!databasePath) {
			throw new Error('No databasePath specified');
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

		if (!('opfs' in this.sqlite3)) {
			throw new Error('OPFS not available');
		}

		if (this.db) {
			await this.destroy();
		}

		this.db = new this.sqlite3.oo1.OpfsDb(databasePath, flags);
		this.config = config;
	}

	override async isDatabasePersisted(): Promise<boolean> {
		return navigator.storage?.persisted();
	}

	override async import(
		database: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
	): Promise<void> {
		if (!this.sqlite3 || !this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}

		await this.destroy();

		const data = await normalizeDatabaseFile(database, 'callback');
		await this.sqlite3.oo1.OpfsDb.importDb(this.config.databasePath, data);
	}

	override async export(): Promise<{
		name: string;
		data: ArrayBuffer | Uint8Array;
	}> {
		if (!this.db || !this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}

		let name, data;

		const path = parseDatabasePath(this.config.databasePath);
		const { directories, getDirectoryHandle } = path;
		name = path.fileName;
		const tempFileName = `backup-${Date.now()}--${name}`;
		const tempFilePath = `${directories.join('/')}/${tempFileName}`;

		this.db.exec({ sql: 'VACUUM INTO ?', bind: [tempFilePath] });

		const dirHandle = await getDirectoryHandle();
		const fileHandle = await dirHandle.getFileHandle(tempFileName);
		const file = await fileHandle.getFile();
		data = await file.arrayBuffer();
		await dirHandle.removeEntry(tempFileName);

		return { name, data };
	}

	override async clear(): Promise<void> {
		if (!this.config?.databasePath) throw new Error('Driver not initialized');

		await this.destroy();

		const { getDirectoryHandle, fileName, tempFileNames } = parseDatabasePath(
			this.config.databasePath
		);
		const dirHandle = await getDirectoryHandle();
		const fileNames = [fileName, ...tempFileNames];

		await Promise.all(
			fileNames.map(async (name) => {
				return dirHandle.removeEntry(name).catch((err) => {
					if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
						throw err;
					}
				});
			})
		);
	}

	override async destroy(): Promise<void> {
		this.closeDb();
	}
}
