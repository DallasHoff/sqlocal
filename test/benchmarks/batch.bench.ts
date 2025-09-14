import { bench, describe } from 'vitest';
import { SQLocal } from '../../src/client.js';

describe.each([
	{ type: 'opfs', path: 'batch-bench.sqlite3' },
	{ type: 'memory', path: ':memory:' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('batch ($type)', async ({ path }) => {
	const { sql, batch } = new SQLocal(path);

	await sql`DROP TABLE IF EXISTS groceries`;
	await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY, name TEXT NOT NULL, num INTEGER NOT NULL)`;

	bench('batch large replace', async () => {
		await batch((sql) => {
			return new Array(5000).fill(null).map((_, i) => {
				const id = (i % 500) + 1;
				return sql`INSERT OR REPLACE INTO groceries (id, name, num) VALUES (${id}, ${'item' + id}, ${(i % 15) + 1})`;
			});
		});
	});
});
