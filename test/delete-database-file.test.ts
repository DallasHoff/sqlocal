import { describe, it, expect, vi } from 'vitest';
import { SQLocal } from '../src/index.js';
import { sleep } from './test-utils/sleep.js';
import type { ClientConfig, ConnectReason } from '../src/types.js';

describe.each([
	{ type: 'opfs', path: 'delete-db-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
])('deleteDatabaseFile ($type)', ({ path, type }) => {
	it('should delete the database file', async () => {
		let onConnectReason: ConnectReason | null = null;
		let beforeUnlockCalled = false;

		const { sql, deleteDatabaseFile, destroy } = new SQLocal({
			databasePath: path,
			onConnect: (reason) => (onConnectReason = reason),
		});

		await vi.waitUntil(() => onConnectReason === 'initial');
		onConnectReason = null;

		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await sql`INSERT INTO nums (num) VALUES (123)`;

		const nums1 = await sql`SELECT * FROM nums`;
		expect(nums1).toEqual([{ num: 123 }]);

		await deleteDatabaseFile(() => {
			beforeUnlockCalled = true;
		});

		expect(onConnectReason).toBe('delete');
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
		let onConnectReason1: ConnectReason | null = null;
		let onConnectReason2: ConnectReason | null = null;

		const db1 = new SQLocal({
			databasePath: path,
			onConnect: (reason) => (onConnectReason1 = reason),
		});
		const db2 = new SQLocal({
			databasePath: path,
			onConnect: (reason) => (onConnectReason2 = reason),
		});

		await vi.waitUntil(() => onConnectReason1 === 'initial');
		onConnectReason1 = null;
		await vi.waitUntil(() => onConnectReason2 === 'initial');
		onConnectReason2 = null;

		await db1.deleteDatabaseFile();

		if (type !== 'memory') {
			await vi.waitUntil(() => onConnectReason2 === 'delete');
			expect(onConnectReason2).toBe('delete');
		} else {
			expect(onConnectReason2).toBe(null);
		}

		expect(onConnectReason1).toBe('delete');

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

	it('should run onInit statements before other queries after deletion', async () => {
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
		await db1.deleteDatabaseFile();
		const [{ foreign_keys: result3 }] = await db1.sql`PRAGMA foreign_keys`;
		results.push(result3);
		const [{ foreign_keys: result4 }] = await db2.sql`PRAGMA foreign_keys`;
		results.push(result4);

		expect(results).toEqual([1, 0, 1, 1]);

		await db1.destroy();
		await db2.destroy();
	});
});
