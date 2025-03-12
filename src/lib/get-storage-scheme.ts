import type { DatabasePath, Sqlite3StorageScheme } from '../types.js';

export function getStorageScheme(
	databasePath: DatabasePath
): Sqlite3StorageScheme {
	switch (databasePath) {
		case 'local':
		case ':localStorage:':
		case 'session':
		case ':sessionStorage:':
			return 'web-storage';

		case ':memory:':
			return 'memory';

		default:
			return 'file';
	}
}
