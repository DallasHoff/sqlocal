import { describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe('getDatabaseFile', () => {
	const fileName = 'get-database-file-test.sqlite3';
	const paths = [[], [''], ['top'], ['one', 'two']];

	it('should return the requested database file', async () => {
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
	});

	it('should not throw when requested database has not been created', async () => {
		const { getDatabaseFile } = new SQLocal('blank.sqlite3');
		await expect(getDatabaseFile()).resolves.not.toThrow();
	});

	it('should stream the database file', async () => {
		const db1 = new SQLocal('get-database-stream.sqlite3');
		const db2 = new SQLocal('get-database-stream-copy.sqlite3');
		const dataLength = 50000;

		await db1.sql`CREATE TABLE nums (num REAL NOT NULL)`;
		await db1.batch((sql) => {
			const nums = new Array(dataLength).fill(0).map(() => Math.random());
			return nums.map((num) => sql`INSERT INTO nums (num) VALUES (${num})`);
		});

		const dbSize = await db1.getDatabaseInfo();
		expect(dbSize.databaseSizeBytes).toBeGreaterThan(800000);

		const stream = await db1.getDatabaseFile(true);
		await db1.deleteDatabaseFile();
		await db2.overwriteDatabaseFile(stream);

		const data = await db2.sql`SELECT count(*) as dataLength FROM nums`;
		await db2.deleteDatabaseFile();
		expect(data).toEqual([{ dataLength }]);
	});
});
