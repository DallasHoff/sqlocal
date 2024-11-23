import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'destroy-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
])('destroy ($type)', ({ path }) => {
	const { sql, destroy } = new SQLocal(path);

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		const { sql } = new SQLocal(path);
		await sql`DROP TABLE IF EXISTS groceries`;
	});

	it('should destroy the client', async () => {
		const insert1 =
			await sql`INSERT INTO groceries (name) VALUES ('pasta') RETURNING name`;
		expect(insert1).toEqual([{ name: 'pasta' }]);

		await destroy();

		const insert2Fn = async () =>
			await sql`INSERT INTO groceries (name) VALUES ('sauce') RETURNING name`;
		await expect(insert2Fn).rejects.toThrowError();
	});
});
