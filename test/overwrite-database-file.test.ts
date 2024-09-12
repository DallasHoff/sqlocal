import { describe, it, expect, vi } from 'vitest';
import { SQLocal } from '../src/index.js';

describe('overwriteDatabaseFile', () => {
	it('should replace the contents of a database', async () => {
		const eventValues = new Set<string>();
		const db1 = new SQLocal({
			databasePath: 'overwrite-test-db1.sqlite3',
			onConnect: () => eventValues.add('connect1'),
		});
		const db2 = new SQLocal({
			databasePath: 'overwrite-test-db2.sqlite3',
			onConnect: () => eventValues.add('connect2'),
		});

		await db1.sql`CREATE TABLE letters (letter TEXT NOT NULL)`;
		await db1.sql`INSERT INTO letters (letter) VALUES ('a'), ('b'), ('c')`;

		await db2.sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await db2.sql`INSERT INTO nums (num) VALUES (1), (2), (3)`;

		await vi.waitUntil(() => {
			return eventValues.has('connect1') && eventValues.has('connect2');
		});
		eventValues.clear();

		const db2File = await db2.getDatabaseFile();
		await db1.overwriteDatabaseFile(db2File, () => {
			eventValues.add('unlock1');
		});

		expect(eventValues.has('unlock1')).toBe(true);
		expect(eventValues.has('connect1')).toBe(true);
		expect(eventValues.has('connect2')).toBe(false);

		const letters = db1.sql`SELECT * FROM letters`;
		expect(letters).rejects.toThrow();

		const nums = db1.sql`SELECT * FROM nums`;
		expect(nums).resolves.toEqual([{ num: 1 }, { num: 2 }, { num: 3 }]);

		await db1.deleteDatabaseFile();
		await db2.deleteDatabaseFile();
		await db1.destroy();
		await db2.destroy();
	});

	it('should notify other instances of an overwrite', async () => {
		const eventValues = new Set<string>();
		const db1 = new SQLocal({
			databasePath: 'overwrite-test-db-shared.sqlite3',
			onConnect: () => eventValues.add('connect1'),
		});
		const db2 = new SQLocal({
			databasePath: 'overwrite-test-db-shared.sqlite3',
			onConnect: () => eventValues.add('connect2'),
		});

		await db2.sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await db2.sql`INSERT INTO nums (num) VALUES (123)`;

		await vi.waitUntil(() => {
			return eventValues.has('connect1') && eventValues.has('connect2');
		});
		eventValues.clear();

		const nums1 = await db1.sql`SELECT * FROM nums`;
		expect(nums1).toEqual([{ num: 123 }]);

		const dbFile = await db2.getDatabaseFile();
		await db2.sql`INSERT INTO nums (num) VALUES (456)`;
		await db1.overwriteDatabaseFile(dbFile, async () => {
			await db1.sql`INSERT INTO nums (num) VALUES (789)`;
			eventValues.add('unlock1');
		});

		await vi.waitUntil(() => eventValues.size === 3);
		expect(eventValues.has('unlock1')).toBe(true);
		expect(eventValues.has('connect1')).toBe(true);
		expect(eventValues.has('connect2')).toBe(true);

		const expectedNums = [{ num: 123 }, { num: 789 }];
		const nums2 = await db1.sql`SELECT * FROM nums`;
		expect(nums2).toEqual(expectedNums);
		const nums3 = await db2.sql`SELECT * FROM nums`;
		expect(nums3).toEqual(expectedNums);

		await db1.destroy();
		await db2.deleteDatabaseFile();
		await db2.destroy();
	});

	it('should restore user functions', async () => {
		const db = new SQLocal('overwrite-test-db-functions.sqlite3');
		await db.createScalarFunction('double', (num: number) => num * 2);

		const num1 = await db.sql`SELECT double(1) AS num`;
		expect(num1).toEqual([{ num: 2 }]);

		const dbFile = await db.getDatabaseFile();
		await db.overwriteDatabaseFile(dbFile);

		const num2 = await db.sql`SELECT double(2) AS num`;
		expect(num2).toEqual([{ num: 4 }]);
	});
});
