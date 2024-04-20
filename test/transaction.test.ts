import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('transaction', () => {
	const { sql, transaction } = new SQLocal('transaction-test.sqlite3');

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
	});

	it('should perform successful transaction', async () => {
		const txData = await transaction((sql) => [
			sql`INSERT INTO groceries (name) VALUES ('apples') RETURNING *`,
			sql`INSERT INTO groceries (name) VALUES ('bananas')`,
		]);

		expect(txData).toEqual([[{ id: 1, name: 'apples' }], []]);

		const selectData = await sql`SELECT * FROM groceries`;
		expect(selectData.length).toBe(2);
	});

	it('should rollback failed transaction', async () => {
		const txData = await transaction((sql) => [
			sql`INSERT INTO groceries (name) VALUES ('carrots') RETURNING *`,
			sql`INSERT INT groceries (name) VALUES ('lettuce') RETURNING *`,
		]).catch(() => [[], []]);

		expect(txData).toEqual([[], []]);

		const selectData = await sql`SELECT * FROM groceries`;
		expect(selectData.length).toBe(0);
	});

	it('should perform successful manual transaction', async () => {
		let rolledBack = false;
		await sql`BEGIN TRANSACTION`;

		try {
			await sql`INSERT INTO groceries (name) VALUES ('apples')`;
			await sql`INSERT INTO groceries (name) VALUES ('bananas')`;
		} catch (err) {
			await sql`ROLLBACK`;
			rolledBack = true;
		}

		if (!rolledBack) await sql`END`;

		const data = await sql`SELECT * FROM groceries`;
		expect(data.length).toBe(2);
		expect(rolledBack).toBe(false);
	});

	it('should rollback failed manual transaction', async () => {
		let rolledBack = false;
		await sql`BEGIN TRANSACTION`;

		try {
			await sql`INSERT INTO groceries (name) VALUES ('carrots')`;
			await sql`INSERT INT groceries (name) VALUES ('lettuce')`;
		} catch (err) {
			await sql`ROLLBACK`;
			rolledBack = true;
		}

		if (!rolledBack) await sql`END`;

		const data = await sql`SELECT * FROM groceries`;
		expect(data.length).toBe(0);
		expect(rolledBack).toBe(true);
	});
});
