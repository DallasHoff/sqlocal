import { describe, it, expect, vi } from 'vitest';
import { SQLocal } from '../src/index.js';
import { sleep } from './test-utils/sleep.js';
import type { ClientConfig } from '../src/types.js';

describe.each([
	{ type: 'opfs', path: 'overwrite-db-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
])('overwriteDatabaseFile ($type)', ({ path, type }) => {
	it('should replace the contents of a database', async () => {
		const eventValues = new Set<string>();
		const db1 = new SQLocal({
			databasePath: type === 'opfs' ? 'overwrite-test-db1.sqlite3' : path,
			onConnect: (reason) => eventValues.add(`connect1(${reason})`),
		});
		const db2 = new SQLocal({
			databasePath: type === 'opfs' ? 'overwrite-test-db2.sqlite3' : path,
			onConnect: (reason) => eventValues.add(`connect2(${reason})`),
		});

		await db1.sql`CREATE TABLE letters (letter TEXT NOT NULL)`;
		await db1.sql`INSERT INTO letters (letter) VALUES ('a'), ('b'), ('c')`;

		await db2.sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await db2.sql`INSERT INTO nums (num) VALUES (1), (2), (3)`;

		await vi.waitUntil(() => {
			return (
				eventValues.has('connect1(initial)') &&
				eventValues.has('connect2(initial)')
			);
		});
		eventValues.clear();

		const lettersFile = await db1.getDatabaseFile();
		const numsFile = await db2.getDatabaseFile();
		const letters = [{ letter: 'a' }, { letter: 'b' }, { letter: 'c' }];
		const nums = [{ num: 1 }, { num: 2 }, { num: 3 }];

		// With a File
		await db1.overwriteDatabaseFile(numsFile, () => {
			eventValues.add('unlock1');
		});

		expect(eventValues.has('unlock1')).toBe(true);

		if (type !== 'memory') {
			expect(eventValues.has('connect1(overwrite)')).toBe(true);
			expect(eventValues.has('connect2(overwrite)')).toBe(false);
		}

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

		// Ensure data can still be added
		await db1.sql`INSERT INTO nums (num) VALUES (4), (5)`;
		const nums4 = db1.sql`SELECT * FROM nums`;
		await expect(nums4).resolves.toEqual([...nums, { num: 4 }, { num: 5 }]);

		// Clean up
		await db1.deleteDatabaseFile();
		await db2.deleteDatabaseFile();
		await db1.destroy();
		await db2.destroy();
	});

	it('should or should not notify other instances of an overwrite', async () => {
		const eventValues = new Set<string>();
		const db1 = new SQLocal({
			databasePath: path,
			onConnect: (reason) => eventValues.add(`connect1(${reason})`),
		});
		const db2 = new SQLocal({
			databasePath: path,
			onConnect: (reason) => eventValues.add(`connect2(${reason})`),
		});

		await db2.sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await db2.sql`INSERT INTO nums (num) VALUES (123)`;

		await vi.waitUntil(() => {
			return (
				eventValues.has('connect1(initial)') &&
				eventValues.has('connect2(initial)')
			);
		});
		eventValues.clear();

		if (type !== 'memory') {
			const nums1 = await db1.sql`SELECT * FROM nums`;
			expect(nums1).toEqual([{ num: 123 }]);
		}

		const dbFile = await db2.getDatabaseFile();
		await db2.sql`INSERT INTO nums (num) VALUES (456)`;
		await db1.overwriteDatabaseFile(dbFile, async () => {
			await db1.sql`INSERT INTO nums (num) VALUES (789)`;
			eventValues.add('unlock1');
		});

		if (type !== 'memory') {
			await vi.waitUntil(() => eventValues.size === 3);
			expect(eventValues.has('unlock1')).toBe(true);
			expect(eventValues.has('connect1(overwrite)')).toBe(true);
			expect(eventValues.has('connect2(overwrite)')).toBe(true);
		} else {
			await vi.waitUntil(() => eventValues.size === 1);
			expect(eventValues.has('unlock1')).toBe(true);
		}

		const expectedNums = [{ num: 123 }, { num: 789 }];
		const nums2 = await db1.sql`SELECT * FROM nums`;
		expect(nums2).toEqual(expectedNums);

		if (type !== 'memory') {
			const nums3 = await db2.sql`SELECT * FROM nums`;
			expect(nums3).toEqual(expectedNums);
		}

		await db1.destroy();
		await db2.deleteDatabaseFile();
		await db2.destroy();
	});

	it('should restore user functions', async () => {
		const db = new SQLocal(path);
		await db.createScalarFunction('double', (num: number) => num * 2);

		const num1 = await db.sql`SELECT double(1) AS num`;
		expect(num1).toEqual([{ num: 2 }]);

		const dbFile = await db.getDatabaseFile();
		await db.overwriteDatabaseFile(dbFile);

		const num2 = await db.sql`SELECT double(2) AS num`;
		expect(num2).toEqual([{ num: 4 }]);

		await db.deleteDatabaseFile();
		await db.destroy();
	});

	it('should not interrupt a transaction with database overwrite', async () => {
		const {
			sql,
			transaction,
			getDatabaseFile,
			overwriteDatabaseFile,
			deleteDatabaseFile,
			destroy,
		} = new SQLocal(path);

		const order: number[] = [];

		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		const dbFile = await getDatabaseFile();

		await Promise.all([
			transaction(async (tx) => {
				order.push(1);
				await tx.sql`INSERT INTO nums (num) VALUES (1)`;
				await sleep(100);
				order.push(3);
				await tx.sql`INSERT INTO nums (num) VALUES (3)`;
			}),
			(async () => {
				await sleep(50);
				order.push(2);
				await overwriteDatabaseFile(dbFile);
				await sql`INSERT INTO nums (num) VALUES (2)`;
			})(),
		]);

		const data = await sql`SELECT * FROM nums`;
		expect(data).toEqual([{ num: 2 }]);
		expect(order).toEqual([1, 2, 3]);

		await deleteDatabaseFile();
		await destroy();
	});

	it('should run onInit statements before other queries after overwrite', async () => {
		const databasePath = path;
		const onInit: ClientConfig['onInit'] = (sql) => {
			return [sql`PRAGMA foreign_keys = ON`];
		};

		const results: number[] = [];

		const db1 = new SQLocal({ databasePath, onInit });
		const db2 = new SQLocal({ databasePath, onInit });

		const [{ foreign_keys: result1 }] = await db1.sql`PRAGMA foreign_keys`;
		results.push(result1);
		await db1.sql`PRAGMA foreign_keys = OFF`;
		const [{ foreign_keys: result2 }] = await db1.sql`PRAGMA foreign_keys`;
		results.push(result2);
		const file = await db2.getDatabaseFile();
		await db1.overwriteDatabaseFile(file);
		const [{ foreign_keys: result3 }] = await db1.sql`PRAGMA foreign_keys`;
		results.push(result3);
		const [{ foreign_keys: result4 }] = await db2.sql`PRAGMA foreign_keys`;
		results.push(result4);

		expect(results).toEqual([1, 0, 1, 1]);

		await db1.destroy();
		await db2.destroy();
	});
});
