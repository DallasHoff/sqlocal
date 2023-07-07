import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('sql', () => {
	const { sql } = new SQLocal('sql-test.sqlite3');

	beforeAll(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
	});

	afterEach(async () => {
		await sql`DELETE FROM groceries`;
	});

	it('should execute SQL', async () => {
		const items = ['bread', 'milk', 'rice'];
		for (let item of items) {
			const insert = await sql`INSERT INTO groceries (name) VALUES (${item})`;
			expect(insert).toEqual([]);
		}

		const select1 = await sql`SELECT * FROM groceries`;
		expect(select1).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 2, name: 'milk' },
			{ id: 3, name: 'rice' },
		]);

		const delete1 = await sql`DELETE FROM groceries WHERE id = 2`;
		expect(delete1).toEqual([]);

		const update1 = await sql`UPDATE groceries SET name = 'white rice' WHERE id = 3`;
		expect(update1).toEqual([]);

		const select2 = await sql`SELECT name FROM groceries ORDER BY id DESC`;
		expect(select2).toEqual([{ name: 'white rice' }, { name: 'bread' }]);
	});
});
