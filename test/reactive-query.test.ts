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
	{ type: 'memory', path: ':memory:' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('reactiveQuery ($type)', async ({ path, type }) => {
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
			// Each in-memory database is fresh
			if (type === 'memory') return;

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
			const { unsubscribe: unsubscribeExtra } = reactiveExtra.subscribe(
				() => (todosUpdated = true)
			);

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

			// Unsubscribing again is a no-op
			unsubscribe1();
			unsubscribe2();
			unsubscribeExtra();
		}
	);

	it(
		'should notify reactive queries on the same instance',
		{ timeout: 2000 },
		async () => {
			// This test will only involve db1
			let list1: string[] = [];
			let list2: string[] = [];
			const reactive1 = db1.reactiveQuery((sql) => sql`SELECT * FROM todos`);
			const reactive2 = db1.reactiveQuery(
				(sql) => sql`SELECT * FROM todos WHERE title LIKE 'clean %'`
			);
			const callback1 = vi.fn((data: Record<string, any>[]) => {
				list1 = data.map(({ title }) => title);
			});
			const callback2 = vi.fn((data: Record<string, any>[]) => {
				list2 = data.map(({ title }) => title);
			});
			let subscription1, subscription2;

			// Initial query result should be emitted on subscription
			await db1.sql`INSERT INTO todos (title) VALUES ('vacuum')`;
			await sleep(100);
			subscription1 = reactive1.subscribe(callback1);
			await vi.waitUntil(() => list1.length === 1);

			expect(list1).toEqual(['vacuum']);
			expect(callback1).toHaveBeenCalledOnce();

			// Subscription should only emit once for multiple changes close together
			await Promise.all([
				db1.sql`INSERT INTO todos (title) VALUES ('clean bedroom')`,
				db1.sql`INSERT INTO todos (title) VALUES ('dust')`,
			]);
			await vi.waitUntil(() => list1.length === 3);

			expect(list1.sort()).toEqual(['vacuum', 'dust', 'clean bedroom'].sort());
			expect(callback1).toHaveBeenCalledTimes(2);

			// Delete with WHERE clause
			await db1.sql`DELETE FROM todos WHERE title = 'dust'`;
			await vi.waitUntil(() => list1.length === 2);

			expect(list1).toEqual(['vacuum', 'clean bedroom']);
			expect(callback1).toHaveBeenCalledTimes(3);

			// Start a second subscription
			subscription2 = reactive2.subscribe(callback2);
			await vi.waitUntil(() => list2.length === 1);

			expect(list1).toEqual(['vacuum', 'clean bedroom']);
			expect(list2).toEqual(['clean bedroom']);
			expect(callback1).toHaveBeenCalledTimes(3);
			expect(callback2).toHaveBeenCalledTimes(1);

			// Insert something for the second subscription
			await db1.sql`INSERT INTO todos (title) VALUES ('clean kitchen')`;
			await vi.waitUntil(() => list1.length === 3 && list2.length === 2);

			expect(list1).toEqual(['vacuum', 'clean bedroom', 'clean kitchen']);
			expect(list2).toEqual(['clean bedroom', 'clean kitchen']);
			expect(callback1).toHaveBeenCalledTimes(4);
			expect(callback2).toHaveBeenCalledTimes(2);

			// Delete something the second subscription does not retrieve
			await db1.sql`DELETE FROM todos WHERE title = 'vacuum'`;
			await vi.waitUntil(() => list1.length === 2 && list2.length === 2);

			const expectedList = ['clean bedroom', 'clean kitchen'];
			expect(list1).toEqual(expectedList);
			expect(list2).toEqual(expectedList);
			expect(callback1).toHaveBeenCalledTimes(5);
			expect(callback2).toHaveBeenCalledTimes(3);

			// The SQLite "Truncate Optimization" will cause this statement to not emit an event
			// https://sqlite.org/lang_delete.html#truncateopt
			await db1.sql`DELETE FROM todos`;
			await sleep(100);

			expect(list1).toEqual(expectedList);
			expect(list2).toEqual(expectedList);
			expect(callback1).toHaveBeenCalledTimes(5);
			expect(callback2).toHaveBeenCalledTimes(3);
			await expect(db1.sql`SELECT * FROM todos`).resolves.toEqual([]);

			// Unsubscribe
			subscription1.unsubscribe();
			subscription2.unsubscribe();
		}
	);

	it('should notify multiple subscribers to the same query', async () => {
		const reactive = db1.reactiveQuery((sql) => sql`SELECT * FROM groceries`);
		let list1: string[] | null = null;
		let list2: string[] | null = null;
		let expectedList: string[] = [];
		const callback1 = vi.fn((data: Record<string, any>[]) => {
			list1 = data.map(({ name }) => name);
		});
		const callback2 = vi.fn((data: Record<string, any>[]) => {
			list2 = data.map(({ name }) => name);
		});

		// Make 2 subscriptions
		let { unsubscribe: unsubscribe1 } = reactive.subscribe(callback1);
		let { unsubscribe: unsubscribe2 } = reactive.subscribe(callback2);
		await vi.waitUntil(() => list1 !== null && list2 !== null);

		expect(callback1).toHaveBeenCalledTimes(1);
		expect(callback2).toHaveBeenCalledTimes(1);
		expect(list1).toEqual(expectedList);
		expect(list2).toEqual(expectedList);

		// Inserting data should notify both subscribers
		await db1.sql`INSERT INTO groceries (name) VALUES ('apples'), ('oranges')`;
		expectedList = ['apples', 'oranges'];
		await vi.waitUntil(() => list1?.length === 2 && list2?.length === 2);

		expect(callback1).toHaveBeenCalledTimes(2);
		expect(callback2).toHaveBeenCalledTimes(2);
		expect(list1).toEqual(expectedList);
		expect(list2).toEqual(expectedList);

		// Unsubscribe 1 and make sure only the other subscriber is notified again
		unsubscribe1();
		await db1.sql`INSERT INTO groceries (name) VALUES ('bananas')`;
		expectedList = ['apples', 'oranges', 'bananas'];
		await vi.waitUntil(() => list1?.length === 2 && list2?.length === 3);

		expect(callback1).toHaveBeenCalledTimes(2);
		expect(callback2).toHaveBeenCalledTimes(3);
		expect(list1).toEqual(['apples', 'oranges']);
		expect(list2).toEqual(expectedList);

		// Resubscribe the second subscription
		({ unsubscribe: unsubscribe1 } = reactive.subscribe(callback1));
		await vi.waitUntil(() => list1?.length === 3 && list2?.length === 3);

		expect(callback1).toHaveBeenCalledTimes(3);
		expect(callback2).toHaveBeenCalledTimes(3);
		expect(list1).toEqual(expectedList);
		expect(list2).toEqual(expectedList);

		// Make another data change
		await db1.sql`INSERT INTO groceries (name) VALUES ('grapes')`;
		expectedList = ['apples', 'oranges', 'bananas', 'grapes'];
		await vi.waitUntil(() => list1?.length === 4 && list2?.length === 4);

		expect(callback1).toHaveBeenCalledTimes(4);
		expect(callback2).toHaveBeenCalledTimes(4);
		expect(list1).toEqual(expectedList);
		expect(list2).toEqual(expectedList);

		// Unsubscribe
		unsubscribe1();
		unsubscribe2();
	});

	it('should require the reactive setting to be true', async () => {
		const db = new SQLocal({ databasePath: path });
		const reactive = db.reactiveQuery((sql) => sql`SELECT * FROM foo`);

		expect(() => reactive.subscribe(() => {})).toThrowError();

		await db.destroy();
	});

	it('should require SQL that reads a table and does not write to that same table', async () => {
		const callback = vi.fn();
		const errors: Error[] = [];
		const testStatements = [
			`SELECT 2 + 2`,
			`DELETE FROM todos WHERE title = ''`,
			`UPDATE todos SET title = 'To Do: ' || title`,
			`INSERT INTO todos SELECT * FROM todos`,
		];

		for (let testStatement of testStatements) {
			const { unsubscribe } = db1
				.reactiveQuery(() => ({ sql: testStatement, params: [] }))
				.subscribe(callback, (err) => errors.push(err));
			await sleep(100);

			expect(errors.length).toBe(testStatements.indexOf(testStatement) + 1);
			unsubscribe();
		}

		expect(callback).not.toHaveBeenCalled();
		expect(errors.every((err) => err instanceof Error)).toBe(true);
	});
});
