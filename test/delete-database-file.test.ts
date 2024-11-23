import { describe, it, expect, vi } from 'vitest';
import { SQLocal } from '../src/index.js';
import { sleep } from './test-utils/sleep.js';

describe.each([
	{ type: 'opfs', path: 'delete-db-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
])('deleteDatabaseFile ($type)', ({ path, type }) => {
	it('should delete the database file', async () => {
		let onConnectCalled = false;
		let beforeUnlockCalled = false;

		const { sql, deleteDatabaseFile, destroy } = new SQLocal({
			databasePath: path,
			onConnect: () => (onConnectCalled = true),
		});

		await vi.waitUntil(() => onConnectCalled === true);
		onConnectCalled = false;

		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await sql`INSERT INTO nums (num) VALUES (123)`;

		const nums1 = await sql`SELECT * FROM nums`;
		expect(nums1).toEqual([{ num: 123 }]);

		await deleteDatabaseFile(() => {
			beforeUnlockCalled = true;
		});

		expect(onConnectCalled).toBe(true);
		expect(beforeUnlockCalled).toBe(true);

		await sql`CREATE TABLE letters (letter TEXT NOT NULL)`;
		await sql`INSERT INTO letters (letter) VALUES ('x')`;

		const letters = await sql`SELECT * FROM letters`;
		expect(letters).toEqual([{ letter: 'x' }]);

		const nums2 = sql`SELECT * FROM nums`;
		await expect(nums2).rejects.toThrow();

		await deleteDatabaseFile();
		await destroy();
	});

	it('should or should not notify other instances of a delete', async () => {
		let onConnectCalled1 = false;
		let onConnectCalled2 = false;

		const db1 = new SQLocal({
			databasePath: path,
			onConnect: () => (onConnectCalled1 = true),
		});
		const db2 = new SQLocal({
			databasePath: path,
			onConnect: () => (onConnectCalled2 = true),
		});

		await vi.waitUntil(() => onConnectCalled1 === true);
		onConnectCalled1 = false;
		await vi.waitUntil(() => onConnectCalled2 === true);
		onConnectCalled2 = false;

		await db1.deleteDatabaseFile();

		if (type !== 'memory') {
			await vi.waitUntil(() => onConnectCalled2 === true);
			expect(onConnectCalled2).toBe(true);
		} else {
			expect(onConnectCalled2).toBe(false);
		}

		expect(onConnectCalled1).toBe(true);

		await db2.deleteDatabaseFile();
		await db2.destroy();
		await db1.destroy();
	});

	it('should restore user functions', async () => {
		const db = new SQLocal(path);
		await db.createScalarFunction('double', (num: number) => num * 2);

		const num1 = await db.sql`SELECT double(1) AS num`;
		expect(num1).toEqual([{ num: 2 }]);

		await db.deleteDatabaseFile();

		const num2 = await db.sql`SELECT double(2) AS num`;
		expect(num2).toEqual([{ num: 4 }]);

		await db.destroy();
	});

	it('should not interrupt a transaction with database deletion', async () => {
		const { sql, transaction, deleteDatabaseFile, destroy } = new SQLocal(path);
		const createTable = async () => {
			await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		};

		const order: number[] = [];

		await createTable();
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
				await deleteDatabaseFile();
				await createTable();
				await sql`INSERT INTO nums (num) VALUES (2)`;
			})(),
		]);

		const data = await sql`SELECT * FROM nums`;
		expect(data).toEqual([{ num: 2 }]);
		expect(order).toEqual([1, 2, 3]);

		await deleteDatabaseFile();
		await destroy();
	});
});
