import type {
	DriverConfig,
	OpfsVfsType,
	Sqlite3InitModule,
	SQLocalDriver,
} from '../types.js';
import { SQLiteOpfsDriver } from './sqlite-opfs-driver.js';

/**
 * A SQLocal driver that implements the interface needed for
 * interacting with SQLite databases in the origin private file system
 * using the WebLocks-based opfs-wl VFS.
 */
export class SQLiteOpfsWlDriver
	extends SQLiteOpfsDriver
	implements SQLocalDriver
{
	override storageType: OpfsVfsType = 'opfs-wl';

	constructor(sqlite3InitModule?: Sqlite3InitModule) {
		super(sqlite3InitModule);
	}

	override async init(config: DriverConfig): Promise<void> {
		return super.init({ vfs: 'opfs-wl', ...config });
	}
}
