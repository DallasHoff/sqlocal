import { describe, it, expect, afterAll } from 'vitest';
import { SQLocal } from '../src/index.js';

describe('overwriteDatabaseFile', async () => {
	const db1 = new SQLocal('overwrite-test-db1.sqlite3');
	const db2 = new SQLocal('overwrite-test-db2.sqlite3');

	await db1.sql`CREATE TABLE letters (letter TEXT NOT NULL)`;
	await db1.sql`INSERT INTO letters (letter) VALUES ('a'), ('b'), ('c')`;

	await db2.sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
	await db2.sql`INSERT INTO nums (num) VALUES (1), (2), (3)`;

	afterAll(async () => {
		const opfs = await navigator.storage.getDirectory();
		await opfs.removeEntry('overwrite-test-db1.sqlite3');
		await opfs.removeEntry('overwrite-test-db2.sqlite3');
	});

	it('should replace the contents of a database', async () => {
		const db2File = await db2.getDatabaseFile();
		await db1.overwriteDatabaseFile(db2File);

		const letters = db1.sql`SELECT * FROM letters`;
		expect(letters).rejects.toThrow();
		const nums = db1.sql`SELECT * FROM nums`;
		expect(nums).resolves.toEqual([{ num: 1 }, { num: 2 }, { num: 3 }]);
	});
});
