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
import { sleep } from './test-utils/sleep.js';

describe.each([
	{ type: 'opfs', path: 'reactive-query-test.sqlite3' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('reactiveQuery ($type)', async ({ path }) => {
	const db1 = new SQLocal({ databasePath: path, reactive: true });
	const db2 = new SQLocal({ databasePath: path, reactive: true });

	beforeEach(async () => {
		await db1.sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
		await db1.sql`CREATE TABLE todos (title TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await db1.sql`DROP TABLE groceries`;
		await db1.sql`DROP TABLE todos`;
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
			let todosUpdated = false;

			const reactive1 = db1.reactiveQuery(
				(sql) => sql`SELECT * FROM groceries`
			);
			const reactive2 = db2.reactiveQuery(
				(sql) => sql`SELECT * FROM groceries`
			);
			const reactiveExtra = db2.reactiveQuery(
				(sql) => sql`SELECT * FROM todos`
			);
			const callback1 = vi.fn(
				(data: Record<string, any>[]) => (list1 = data.map(({ name }) => name))
			);
			const callback2 = vi.fn(
				(data: Record<string, any>[]) => (list2 = data.map(({ name }) => name))
			);
			const { unsubscribe: unsubscribe1 } = reactive1.subscribe(callback1);
			const { unsubscribe: unsubscribe2 } = reactive2.subscribe(callback2);
			reactiveExtra.subscribe(() => (todosUpdated = true));

			let expected: string[] = [];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			// Insert
			await db1.sql`INSERT INTO groceries (name) VALUES ('bread'), ('eggs')`;
			await vi.waitUntil(() => list1.length === 2 && list2.length === 2);

			expected = ['bread', 'eggs'];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			// Update
			await db2.sql`UPDATE groceries SET name = 'wheat bread' WHERE name = 'bread'`;
			await vi.waitUntil(
				() => list1.includes('wheat bread') && list2.includes('wheat bread')
			);

			expected = ['wheat bread', 'eggs'];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			// Delete
			await db1.sql`DELETE FROM groceries WHERE name = 'wheat bread'`;
			await vi.waitUntil(() => list1.length === 1 && list2.length === 1);

			expected = ['eggs'];
			expect(list1).toEqual(expected);
			expect(list2).toEqual(expected);

			// Edit unrelated table
			todosUpdated = false;
			const prevCallCount = callback1.mock.calls.length;
			await db1.sql`INSERT INTO todos (title) VALUES ('laundry')`;
			await vi.waitUntil(() => todosUpdated === true);
			await sleep(100);

			const newCallCount = callback1.mock.calls.length;
			expect(newCallCount).toBe(prevCallCount);

			// Unsubscribe
			unsubscribe1();
			await db1.sql`INSERT INTO groceries (name) VALUES ('rice')`;
			await vi.waitUntil(() => list2.length === 2);
			await sleep(100);

			expect(list1).toEqual(['eggs']);
			expect(list2).toEqual(['eggs', 'rice']);

			unsubscribe2();
		}
	);
});
