import type { OpfsVfsType, Sqlite3StorageType } from '../../src/types.js';

export function testVariation(
	testSuiteKey: string
): { type: Sqlite3StorageType; path: string; vfs?: OpfsVfsType }[] {
	return [
		{ type: 'opfs', path: `${testSuiteKey}-test.sqlite3` },
		{
			type: 'opfs-wl',
			path: `${testSuiteKey}-opfs-wl-test.sqlite3`,
			vfs: 'opfs-wl',
		},
		{ type: 'memory', path: ':memory:' },
		{ type: 'local', path: ':localStorage:' },
		{ type: 'session', path: ':sessionStorage:' },
	];
}
