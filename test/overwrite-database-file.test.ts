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
		const lettersFile = await db1.getDatabaseFile();
		const numsFile = await db2.getDatabaseFile();
		const letters = [{ letter: 'a' }, { letter: 'b' }, { letter: 'c' }];
		const nums = [{ num: 1 }, { num: 2 }, { num: 3 }];

		// With a File
		await db1.overwriteDatabaseFile(numsFile);

		const letters1 = db1.sql`SELECT * FROM letters`;
		await expect(letters1).rejects.toThrow();
		const nums1 = db1.sql`SELECT * FROM nums`;
		await expect(nums1).resolves.toEqual(nums);

		// With a ReadableStream
		await db1.overwriteDatabaseFile(lettersFile.stream());

		const letters2 = db1.sql`SELECT * FROM letters`;
		await expect(letters2).resolves.toEqual(letters);
		const nums2 = db1.sql`SELECT * FROM nums`;
		await expect(nums2).rejects.toThrow();

		// With an ArrayBuffer
		const numsBuffer = await numsFile.arrayBuffer();
		await db1.overwriteDatabaseFile(numsBuffer);

		const letters3 = db1.sql`SELECT * FROM letters`;
		await expect(letters3).rejects.toThrow();
		const nums3 = db1.sql`SELECT * FROM nums`;
		await expect(nums3).resolves.toEqual(nums);
	});
});
