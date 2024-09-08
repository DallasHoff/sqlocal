import { describe, it, expect, vi } from 'vitest';
import { SQLocal } from '../src/index.js';

describe('deleteDatabaseFile', () => {
	it('should delete the database file', async () => {
		let onConnectCalled = false;
		let beforeUnlockCalled = false;

		const { sql, deleteDatabaseFile, destroy } = new SQLocal({
			databasePath: 'delete-db-test.sqlite3',
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
		expect(nums2).rejects.toThrow();

		await deleteDatabaseFile();
		await destroy();
	});

	it('should notify other instances of a delete', async () => {
		let onConnectCalled1 = false;
		let onConnectCalled2 = false;

		const db1 = new SQLocal({
			databasePath: 'delete-db-shared-test.sqlite3',
			onConnect: () => (onConnectCalled1 = true),
		});
		const db2 = new SQLocal({
			databasePath: 'delete-db-shared-test.sqlite3',
			onConnect: () => (onConnectCalled2 = true),
		});

		await vi.waitUntil(() => onConnectCalled1 === true);
		onConnectCalled1 = false;
		await vi.waitUntil(() => onConnectCalled2 === true);
		onConnectCalled2 = false;

		await db1.deleteDatabaseFile();
		await vi.waitUntil(() => onConnectCalled2 === true);

		expect(onConnectCalled1).toBe(true);
		expect(onConnectCalled2).toBe(true);

		await db2.deleteDatabaseFile();
		await db2.destroy();
		await db1.destroy();
	});
});
