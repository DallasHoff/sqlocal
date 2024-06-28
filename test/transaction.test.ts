import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('transaction', () => {
	const { sql, transaction2 } = new SQLocal('transaction-test.sqlite3');

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
	});

	it('should perform successful transaction', async () => {
		const txData = await transaction2<number>(function* (sql) {
			let idTotal = 0;

			yield sql`INSERT INTO groceries (name) VALUES ('apples'), ('bananas')`;
			const fruits = yield sql`SELECT * FROM groceries`;
			idTotal += fruits.reduce((sum, fruit) => sum + fruit.id, 0);

			const [oranges] =
				yield sql`INSERT INTO groceries (name) VALUES ('oranges') RETURNING *`;
			idTotal += oranges.id;

			return idTotal;
		});

		expect(txData).toBe(6);

		const selectData = await sql`SELECT * FROM groceries`;
		expect(selectData).toEqual([
			{ id: 1, name: 'apples' },
			{ id: 2, name: 'bananas' },
			{ id: 3, name: 'oranges' },
		]);
	});

	it('should rollback failed transaction', async () => {
		const txData = await transaction2(function* (sql) {
			yield sql`INSERT INTO groceries (name) VALUES ('carrots') RETURNING *`;
			yield sql`INSERT INT groceries (name) VALUES ('lettuce') RETURNING *`;
			return true;
		}).catch(() => false);

		expect(txData).toBe(false);

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
