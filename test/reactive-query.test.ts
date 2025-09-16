import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { SQLocal } from '../src/client.js';

describe.each([
	{ type: 'opfs', path: 'reactive-query-test.sqlite3' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('reactiveQuery ($type)', async ({ path }) => {
	const db1 = new SQLocal({ databasePath: path, reactive: true });
	const db2 = new SQLocal({ databasePath: path, reactive: true });

	beforeEach(async () => {
		await db1.sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await db1.sql`DROP TABLE groceries`;
	});

	afterAll(async () => {
		await db1.destroy();
		await db2.destroy();
	});

	it(
		'should notify other instances of data changes',
		{ timeout: 2000 },
		async () => {
			let list1: string[] = [];
			let list2: string[] = [];
			const reactive1 = db1.reactiveQuery(
				(sql) => sql`SELECT * FROM groceries`
			);
			const reactive2 = db2.reactiveQuery(
				(sql) => sql`SELECT * FROM groceries`
			);
			reactive1.subscribe((data) => (list1 = data.map(({ name }) => name)));
			reactive2.subscribe((data) => (list2 = data.map(({ name }) => name)));

			let expected: string[] = [];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			await db1.sql`INSERT INTO groceries (name) VALUES ('bread'), ('eggs')`;
			await vi.waitUntil(() => list1.length === 2 && list2.length === 2);

			expected = ['bread', 'eggs'];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			await db2.sql`UPDATE groceries SET name = 'wheat bread' WHERE name = 'bread'`;
			await vi.waitUntil(
				() => list1.includes('wheat bread') && list2.includes('wheat bread')
			);

			expected = ['wheat bread', 'eggs'];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			await db1.sql`DELETE FROM groceries WHERE name = 'wheat bread'`;
			await vi.waitUntil(() => list1.length === 1 && list2.length === 1);

			expected = ['eggs'];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);
		}
	);
});
