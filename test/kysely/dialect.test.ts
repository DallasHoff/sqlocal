import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, ParseJSONResultsPlugin } from 'kysely';
import type { Generated } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/sqlite';
import { SQLocalKysely } from '../../src/kysely/index.js';
import { sleep } from '../test-utils/sleep.js';
import { testVariation } from '../test-utils/test-variation.js';

describe.each(testVariation('kysely-dialect'))(
	'kysely dialect ($type)',
	({ path }) => {
		const { dialect, transaction, reactiveQuery } = new SQLocalKysely({
			databasePath: path,
			reactive: true,
		});
		const db = new Kysely<DB>({
			dialect,
			plugins: [new ParseJSONResultsPlugin()],
		});

		type DB = {
			groceries: {
				id: Generated<number>;
				name: string;
			};
			prices: {
				id: Generated<number>;
				groceryId: number;
				price: number;
			};
		};

		beforeEach(async () => {
			await db.schema
				.createTable('groceries')
				.addColumn('id', 'integer', (cb) => cb.primaryKey().autoIncrement())
				.addColumn('name', 'text', (cb) => cb.notNull())
				.execute();
			await db.schema
				.createTable('prices')
				.addColumn('id', 'integer', (cb) => cb.primaryKey().autoIncrement())
				.addColumn('groceryId', 'integer', (cb) => cb.notNull())
				.addColumn('price', 'real', (cb) => cb.notNull())
				.execute();
		});

		afterEach(async () => {
			await db.schema.dropTable('groceries').execute();
			await db.schema.dropTable('prices').execute();
		});

		it('should execute queries', async () => {
			const items = ['bread', 'milk', 'rice'];
			for (let item of items) {
				const insert1 = await db
					.insertInto('groceries')
					.values({ name: item })
					.returning(['name'])
					.execute();
				expect(insert1).toEqual([{ name: item }]);
			}

			const select1 = await db.selectFrom('groceries').selectAll().execute();
			expect(select1).toEqual([
				{ id: 1, name: 'bread' },
				{ id: 2, name: 'milk' },
				{ id: 3, name: 'rice' },
			]);

			const delete1 = await db
				.deleteFrom('groceries')
				.where('id', '=', 2)
				.returningAll()
				.execute();
			expect(delete1).toEqual([{ id: 2, name: 'milk' }]);

			const update1 = await db
				.updateTable('groceries')
				.set({ name: 'white rice' })
				.where('id', '=', 3)
				.returning(['name'])
				.execute();
			expect(update1).toEqual([{ name: 'white rice' }]);

			const select2 = await db
				.selectFrom('groceries')
				.select('name')
				.orderBy('id', 'desc')
				.execute();
			expect(select2).toEqual([{ name: 'white rice' }, { name: 'bread' }]);
		});

		it('should execute queries with relations', async () => {
			await db
				.insertInto('groceries')
				.values([{ name: 'chicken' }, { name: 'beef' }])
				.execute();
			await db
				.insertInto('prices')
				.values([
					{ groceryId: 1, price: 3.29 },
					{ groceryId: 1, price: 2.99 },
					{ groceryId: 1, price: 3.79 },
					{ groceryId: 2, price: 5.29 },
					{ groceryId: 2, price: 4.49 },
				])
				.execute();

			const data = await db
				.selectFrom('groceries')
				.select('name')
				.select((eb) => [
					jsonArrayFrom(
						eb
							.selectFrom('prices')
							.select('price')
							.whereRef('groceries.id', '=', 'prices.groceryId')
					).as('prices'),
				])
				.execute();

			expect(data).toEqual([
				{
					name: 'chicken',
					prices: [{ price: 3.29 }, { price: 2.99 }, { price: 3.79 }],
				},
				{
					name: 'beef',
					prices: [{ price: 5.29 }, { price: 4.49 }],
				},
			]);
		});

		it('should perform successful transaction using sqlocal way', async () => {
			const productName = 'rice';
			const productPrice = 2.99;

			const newProductId = await transaction(async (tx) => {
				const [product] = await tx.query(
					db
						.insertInto('groceries')
						.values({ name: productName })
						.returningAll()
						.compile()
				);
				await tx.query(
					db
						.insertInto('prices')
						.values({ groceryId: product.id, price: productPrice })
						.compile()
				);
				return product.id;
			});

			expect(newProductId).toBe(1);

			const selectData1 = await db
				.selectFrom('groceries')
				.selectAll()
				.execute();
			expect(selectData1.length).toBe(1);
			const selectData2 = await db.selectFrom('prices').selectAll().execute();
			expect(selectData2.length).toBe(1);
		});

		it('should rollback failed transaction using sqlocal way', async () => {
			const recordCount = await transaction(async ({ query }) => {
				await query(
					db.insertInto('groceries').values({ name: 'carrots' }).compile()
				);
				await query(
					db
						.insertInto('groeries' as any)
						.values({ name: 'lettuce' })
						.compile()
				);
				const data = await query(
					db.selectFrom('groceries').selectAll().compile()
				);
				return data.length;
			}).catch(() => null);

			expect(recordCount).toBe(null);

			const data = await db.selectFrom('groceries').selectAll().execute();
			expect(data.length).toBe(0);
		});

		it('should isolate transaction mutations using sqlocal way', async () => {
			const order: number[] = [];

			await Promise.all([
				transaction(async ({ query }) => {
					order.push(1);
					await query(
						db.insertInto('groceries').values({ name: 'a' }).compile()
					);
					await sleep(200);
					order.push(3);
					await query(
						db.insertInto('groceries').values({ name: 'b' }).compile()
					);
				}),
				(async () => {
					await sleep(100);
					order.push(2);
					await db.updateTable('groceries').set({ name: 'x' }).execute();
				})(),
			]);

			const data = await db.selectFrom('groceries').select(['name']).execute();

			expect(data).toEqual([{ name: 'x' }, { name: 'x' }]);
			expect(order).toEqual([1, 2, 3]);
		});

		it('should perform successful transaction using kysely way', async () => {
			await db.transaction().execute(async (tx) => {
				await tx.insertInto('groceries').values({ name: 'apples' }).execute();
				await tx.insertInto('groceries').values({ name: 'bananas' }).execute();
			});

			const data = await db.selectFrom('groceries').selectAll().execute();
			expect(data.length).toBe(2);
		});

		it('should rollback failed transaction using kysely way', async () => {
			await db
				.transaction()
				.execute(async (tx) => {
					await tx
						.insertInto('groceries')
						.values({ name: 'carrots' })
						.execute();
					await tx
						.insertInto('groeries' as any)
						.values({ name: 'lettuce' })
						.execute();
				})
				.catch(() => {});

			const data = await db.selectFrom('groceries').selectAll().execute();
			expect(data.length).toBe(0);
		});

		it('should isolate transaction mutations using kysely way', async () => {
			const order: number[] = [];

			await Promise.all([
				db.transaction().execute(async (tx) => {
					order.push(1);
					await tx.insertInto('groceries').values({ name: 'a' }).execute();
					await sleep(200);
					order.push(3);
					await tx.insertInto('groceries').values({ name: 'b' }).execute();
				}),
				(async () => {
					await sleep(100);
					order.push(2);
					await db.updateTable('groceries').set({ name: 'x' }).execute();
				})(),
			]);

			const data = await db.selectFrom('groceries').select(['name']).execute();

			expect(data).toEqual([{ name: 'x' }, { name: 'x' }]);
			expect(order).toEqual([1, 2, 3]);
		});

		it('should introspect the database', async () => {
			const schemas = await db.introspection.getSchemas();
			expect(schemas).toEqual([]);

			const tables = await db.introspection.getTables();
			const { name: tableName, columns } = tables[0];
			expect(tableName).toBe('groceries');
			expect(columns).toEqual([
				{
					name: 'id',
					dataType: 'INTEGER',
					hasDefaultValue: false,
					isAutoIncrementing: true,
					isNullable: true,
				},
				{
					name: 'name',
					dataType: 'TEXT',
					hasDefaultValue: false,
					isAutoIncrementing: false,
					isNullable: false,
				},
			]);
		});

		it('should support reactive queries', async () => {
			await db
				.insertInto('groceries')
				.values([{ name: 'bread' }])
				.execute();

			let list: string[] = [];
			let expectedList: string[] = ['bread'];

			const reactive = reactiveQuery(
				db.selectFrom('groceries').selectAll().compile()
			);
			const { unsubscribe } = reactive.subscribe((data) => {
				list = data.map((item) => item.name);
			});
			await vi.waitUntil(() => list.length === 1);

			expect(list).toEqual(expectedList);
			expect(reactive.value.map((item) => item.name)).toEqual(expectedList);

			await db
				.insertInto('groceries')
				.values([{ name: 'rice' }])
				.execute();
			expectedList.push('rice');
			await vi.waitUntil(() => list.length === 2);

			expect(list).toEqual(expectedList);
			expect(reactive.value.map((item) => item.name)).toEqual(expectedList);
			unsubscribe();
		});
	}
);
