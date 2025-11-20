import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';
import { sleep } from './test-utils/sleep.js';
import { testVariation } from './test-utils/test-variation.js';

describe.each(testVariation('transaction'))(
	'transaction ($type)',
	({ path, type }) => {
		const db1 = new SQLocal(path);
		const db2 = new SQLocal(path);

		beforeEach(async () => {
			for (let db of [db1, db2]) {
				await db.sql`CREATE TABLE IF NOT EXISTS groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
				await db.sql`CREATE TABLE IF NOT EXISTS prices (id INTEGER PRIMARY KEY AUTOINCREMENT, groceryId INTEGER NOT NULL, price REAL NOT NULL)`;
			}
		});

		afterEach(async () => {
			for (let db of [db1, db2]) {
				await db.sql`DROP TABLE IF EXISTS groceries`;
				await db.sql`DROP TABLE IF EXISTS prices`;
			}
		});

		afterAll(async () => {
			for (let db of [db1, db2]) {
				await db.destroy();
			}
		});

		it('should perform successful transaction', async () => {
			const productName = 'rice';
			const productPrice = 2.99;

			const newProductId = await db1.transaction(async (tx) => {
				const [product] = await tx.sql`
				INSERT INTO groceries (name) VALUES (${productName}) RETURNING *
			`;
				await tx.sql`
				INSERT INTO prices (groceryId, price) VALUES (${product.id}, ${productPrice})
			`;
				return product.id;
			});

			expect(newProductId).toBe(1);

			const selectData1 = await db1.sql`SELECT * FROM groceries`;
			expect(selectData1.length).toBe(1);
			const selectData2 = await db1.sql`SELECT * FROM prices`;
			expect(selectData2.length).toBe(1);
		});

		it('should rollback failed transaction', async () => {
			const txData = await db1
				.transaction(async (tx) => {
					await tx.sql`INSERT INTO groceries (name) VALUES ('carrots')`;
					await tx.sql`INSERT INT groceries (name) VALUES ('lettuce')`;
					return true;
				})
				.catch(() => false);

			expect(txData).toEqual(false);

			const selectData = await db1.sql`SELECT * FROM groceries`;
			expect(selectData.length).toBe(0);
		});

		it('should perform batch queries inside a transaction', async () => {
			const txData = await db1.transaction(async (tx) => {
				const letters = await tx.batch((sql) => {
					return ['a', 'b', 'c'].map((letter) => {
						return sql`INSERT INTO groceries (name) VALUES (${letter}) RETURNING name`;
					});
				});

				await tx.sql`INSERT INTO groceries (name) VALUES ('x')`;

				const doubles = await tx.batch((sql) => {
					return letters.map((letter) => {
						const single = letter[0].name;
						const double = single + single;
						return sql`INSERT INTO groceries (name) VALUES (${double}) RETURNING name`;
					});
				});

				return [...letters, ...doubles];
			});

			expect(txData).toEqual([
				[{ name: 'a' }],
				[{ name: 'b' }],
				[{ name: 'c' }],
				[{ name: 'aa' }],
				[{ name: 'bb' }],
				[{ name: 'cc' }],
			]);

			const selectData = await db1.sql`SELECT * FROM groceries`;
			expect(selectData.length).toBe(7);
		});

		it('should rollback failed transaction with batches', async () => {
			const order: number[] = [];

			const txData = await db1
				.transaction(async (tx) => {
					order.push(1);
					await tx.batch((sql) => {
						return ['a', 'b'].map((letter) => {
							return sql`INSERT INTO groceries (name) VALUES (${letter})`;
						});
					});
					order.push(2);
					await tx.sql`INSERT INTO groceries (name) VALUES ('x')`;
					order.push(3);
					await tx.batch((sql) => {
						return ['y', 'z'].map((letter) => {
							return sql`INSERT INT groceries (name) VALUES (${letter})`;
						});
					});
					order.push(4);
					return true;
				})
				.catch(() => false);

			expect(txData).toEqual(false);
			expect(order).toEqual([1, 2, 3]);

			const selectData = await db1.sql`SELECT * FROM groceries`;
			expect(selectData.length).toBe(0);
		});

		it('should isolate transaction mutations from outside queries', async () => {
			const order: number[] = [];

			await Promise.all([
				db1.transaction(async (tx) => {
					order.push(1);
					await tx.sql`INSERT INTO groceries (name) VALUES ('a')`;
					await sleep(200);
					order.push(3);
					await tx.sql`INSERT INTO groceries (name) VALUES ('b')`;
				}),
				(async () => {
					await sleep(100);
					order.push(2);
					await db1.sql`UPDATE groceries SET name = 'x'`;
				})(),
			]);

			const data = await db1.sql`SELECT name FROM groceries`;

			expect(data).toEqual([{ name: 'x' }, { name: 'x' }]);
			expect(order).toEqual([1, 2, 3]);
		});

		it('should isolate transaction mutations from outside batch queries', async () => {
			const order: number[] = [];

			await Promise.all([
				db1.transaction(async (tx) => {
					order.push(1);
					await tx.sql`INSERT INTO groceries (name) VALUES ('a')`;
					await sleep(200);
					order.push(3);
					await tx.sql`INSERT INTO groceries (name) VALUES ('b')`;
				}),
				(async () => {
					await sleep(100);
					order.push(2);
					await db1.batch((sql) => [sql`UPDATE groceries SET name = 'x'`]);
				})(),
			]);

			const data = await db1.sql`SELECT name FROM groceries`;

			expect(data).toEqual([{ name: 'x' }, { name: 'x' }]);
			expect(order).toEqual([1, 2, 3]);
		});

		it('should complete concurrent transactions on the same connection', async () => {
			const order: number[] = [];

			const transactions = Promise.all([
				db1.transaction(async (tx) => {
					order.push(1);
					await tx.sql`INSERT INTO groceries (name) VALUES ('a') RETURNING name`;
					await sleep(100);
					order.push(2);
					return tx.sql`SELECT name FROM groceries`;
				}),
				db1.transaction(async (tx) => {
					await sleep(50);
					order.push(3);
					return tx.sql`INSERT INTO groceries (name) VALUES ('b') RETURNING name`;
				}),
			]);

			await expect(transactions).resolves.toEqual([
				[{ name: 'a' }],
				[{ name: 'b' }],
			]);

			const data = await db1.sql`SELECT name FROM groceries`;
			expect(data).toEqual([{ name: 'a' }, { name: 'b' }]);
			expect(order).toEqual([1, 2, 3]);
		});

		it('should complete concurrent transactions on different connections', async () => {
			const order: number[] = [];

			const transactions = Promise.all([
				db1.transaction(async (tx) => {
					order.push(1);
					await tx.sql`INSERT INTO groceries (name) VALUES ('a') RETURNING name`;
					await sleep(100);
					order.push(3);
					return tx.sql`SELECT name FROM groceries`;
				}),
				db2.transaction(async (tx) => {
					await sleep(50);
					order.push(2);
					return tx.sql`INSERT INTO groceries (name) VALUES ('b') RETURNING name`;
				}),
			]);

			await expect(transactions).resolves.toEqual([
				[{ name: 'a' }],
				[{ name: 'b' }],
			]);

			const data = await db1.sql`SELECT name FROM groceries`;
			expect(data).toEqual(
				type !== 'memory' ? [{ name: 'a' }, { name: 'b' }] : [{ name: 'a' }]
			);
			expect(order).toEqual(
				['memory', 'opfs'].includes(type) ? [1, 2, 3] : [1, 3, 2]
			);
		});
	}
);
