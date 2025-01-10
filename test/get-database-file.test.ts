import { describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'get-database-file-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('getDatabaseFile ($type)', ({ path, type }) => {
	const fileName = type !== 'opfs' ? 'database.sqlite3' : path;
	const paths = [[], [''], ['top'], ['one', 'two']];

	it(
		'should return the requested database file',
		{ timeout: ['local', 'session'].includes(type) ? 3000 : undefined },
		async () => {
			for (let path of paths) {
				const databasePath = [...path, fileName].join('/');
				const { sql, getDatabaseFile, deleteDatabaseFile } = new SQLocal(
					databasePath
				);

				await sql`CREATE TABLE nums (num REAL NOT NULL)`;
				const file = await getDatabaseFile();
				const now = new Date().getTime();

				expect(file).toBeInstanceOf(File);
				expect(file.name).toBe(fileName);
				expect(file.size).toBe(16384);
				expect(file.type).toBe('application/x-sqlite3');
				expect(now - file.lastModified).toBeLessThan(50);

				await deleteDatabaseFile();
			}
		}
	);

	it('should not throw when requested database has not been created', async () => {
		const databasePath = type === 'opfs' ? 'new.sqlite3' : path;
		const { getDatabaseFile } = new SQLocal(databasePath);
		await expect(getDatabaseFile()).resolves.not.toThrow();
	});
});
