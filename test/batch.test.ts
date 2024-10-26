import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'batch-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
])('batch ($type)', ({ path }) => {
	const { sql, batch } = new SQLocal(path);

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
	});

	it('should perform successful batch query', async () => {
		const txData = await batch((sql) => [
			sql`INSERT INTO groceries (name) VALUES ('apples') RETURNING *`,
			sql`INSERT INTO groceries (name) VALUES ('bananas')`,
		]);

		expect(txData).toEqual([[{ id: 1, name: 'apples' }], []]);

		const selectData = await sql`SELECT * FROM groceries`;
		expect(selectData.length).toBe(2);
	});

	it('should rollback failed batch query', async () => {
		const txData = await batch((sql) => [
			sql`INSERT INTO groceries (name) VALUES ('carrots') RETURNING *`,
			sql`INSERT INT groceries (name) VALUES ('lettuce') RETURNING *`,
		]).catch(() => [[], []]);

		expect(txData).toEqual([[], []]);

		const selectData = await sql`SELECT * FROM groceries`;
		expect(selectData.length).toBe(0);
	});
});
