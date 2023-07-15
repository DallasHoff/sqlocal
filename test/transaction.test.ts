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
});
