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
		await transaction((sql) => [
			sql`INSERT INTO groceries (name) VALUES ('apples')`,
			sql`INSERT INTO groceries (name) VALUES ('bananas')`,
		]);

		const data = await sql`SELECT * FROM groceries`;
		expect(data.length).toBe(2);
	});

	it('should rollback failed transaction', async () => {
		await transaction((sql) => [
			sql`INSERT INTO groceries (name) VALUES ('carrots')`,
			sql`INSERT INT groceries (name) VALUES ('lettuce')`,
		]).catch(() => {});

		const data = await sql`SELECT * FROM groceries`;
		expect(data.length).toBe(0);
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
