import type { Sqlite3StorageType } from '../../src/types.js';

export function testVariation(
	testSuiteKey: string
): { type: Sqlite3StorageType; path: string }[] {
	return [
		{ type: 'opfs', path: `${testSuiteKey}-test.sqlite3` },
		{ type: 'memory', path: ':memory:' },
		{ type: 'local', path: ':localStorage:' },
		{ type: 'session', path: ':sessionStorage:' },
	];
}
