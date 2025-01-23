import { beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each(
	typeof window !== 'undefined'
		? [
				{ type: 'opfs', path: 'get-database-info-test.sqlite3' },
				{ type: 'memory', path: ':memory:' },
				{ type: 'local', path: ':localStorage:' },
				{ type: 'session', path: ':sessionStorage:' },
			]
		: [{ type: 'node', path: './.db/get-database-info-test.sqlite3' }]
)('getDatabaseInfo ($type)', ({ type, path }) => {
	const { sql, getDatabaseInfo, deleteDatabaseFile } = new SQLocal(path);

	beforeEach(async () => {
		await deleteDatabaseFile();
	});

	it('should return information about the database', async () => {
		const info1 = await getDatabaseInfo();

		expect(info1).toEqual({
			databasePath: path,
			databaseSizeBytes: 0,
			storageType: type,
			persisted: type === 'node',
		});

		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await sql`INSERT INTO nums (num) VALUES (493), (820), (361), (125)`;

		const info2 = await getDatabaseInfo();
		expect(info2.databaseSizeBytes).toBeGreaterThan(0);

		await deleteDatabaseFile();
	});
});
