import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocalDrizzle } from '../../src/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { desc, eq, relations, sql as dsql } from 'drizzle-orm';

describe('drizzle driver', () => {
	const { sql, driver, batchDriver } = new SQLocalDrizzle(
		'drizzle-driver-test.sqlite3'
	);

	const groceries = sqliteTable('groceries', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
	});

	const groceriesRelations = relations(groceries, ({ many }) => ({
		prices: many(prices),
	}));

	const prices = sqliteTable('prices', {
		id: int('id').primaryKey({ autoIncrement: true }),
		groceryId: int('groceryId').notNull(),
		usd: real('usd').notNull(),
	});

	const pricesRelations = relations(prices, ({ one }) => ({
		grocery: one(groceries, {
			fields: [prices.groceryId],
			references: [groceries.id],
		}),
	}));

	const db = drizzle(driver, batchDriver, {
		schema: { groceries, groceriesRelations, prices, pricesRelations },
	});

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
		await sql`CREATE TABLE prices (id INTEGER PRIMARY KEY AUTOINCREMENT, groceryId INTEGER NOT NULL, usd REAL NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
		await sql`DROP TABLE prices`;
	});

	it('should execute queries', async () => {
		const insert1Prepared = db
			.insert(groceries)
			.values({ name: dsql.placeholder('name') })
			.returning({ name: groceries.name })
			.prepare();
		const items = ['bread', 'milk', 'rice'];

		for (let item of items) {
			const insert1 = await insert1Prepared.get({ name: item });
			expect(insert1).toEqual({ name: item });
		}

		const select1 = await db.select().from(groceries).all();
		expect(select1).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 2, name: 'milk' },
			{ id: 3, name: 'rice' },
		]);

		const delete1 = await db
			.delete(groceries)
			.where(eq(groceries.id, 2))
			.returning()
			.get();
		expect(delete1).toEqual({ id: 2, name: 'milk' });

		const update1 = await db
			.update(groceries)
			.set({ name: 'white rice' })
			.where(eq(groceries.id, 3))
			.returning({ name: groceries.name })
			.all();
		expect(update1).toEqual([{ name: 'white rice' }]);

		const select2 = await db
			.select({ name: groceries.name })
			.from(groceries)
			.orderBy(desc(groceries.id))
			.all();
		expect(select2).toEqual([{ name: 'white rice' }, { name: 'bread' }]);
	});

	it('should perform successful transaction', async () => {
		await db.transaction(async (trx) => {
			await trx.insert(groceries).values({ name: 'apples' }).run();
			await trx.insert(groceries).values({ name: 'bananas' }).run();
		});

		const data = await db.select().from(groceries).all();
		expect(data.length).toBe(2);
	});

	it('should rollback failed transaction', async () => {
		await db
			.transaction(async (trx) => {
				await trx.insert(groceries).values({ name: 'apples' }).run();
				await trx
					.insert(groceries)
					.values({ nam: 'bananas' } as any)
					.run();
			})
			.catch(() => {});

		const data = await db.select().from(groceries).all();
		expect(data.length).toBe(0);
	});

	it('should accept batched queries', async () => {
		const data = await db.batch([
			db.insert(groceries).values({ name: 'bread' }),
			db
				.insert(groceries)
				.values({ name: 'rice' })
				.returning({ name: groceries.name }),
			db.insert(groceries).values({ name: 'milk' }).returning(),
			db.select().from(groceries),
		]);

		expect(data).toEqual([
			{ rows: [], columns: [] },
			[{ name: 'rice' }],
			[{ id: 3, name: 'milk' }],
			[
				{ id: 1, name: 'bread' },
				{ id: 2, name: 'rice' },
				{ id: 3, name: 'milk' },
			],
		]);
	});

	it('should execute relational queries', async () => {
		await db.batch([
			db.insert(groceries).values({ name: 'chicken' }),
			db.insert(groceries).values({ name: 'beef' }),
			db.insert(prices).values([
				{ groceryId: 1, usd: 3.29 },
				{ groceryId: 1, usd: 2.99 },
				{ groceryId: 1, usd: 3.79 },
				{ groceryId: 2, usd: 5.29 },
				{ groceryId: 2, usd: 4.49 },
			]),
		]);

		const data = await db.query.groceries.findMany({
			columns: {
				name: true,
			},
			with: {
				prices: {
					columns: {
						usd: true,
					},
				},
			},
		});

		expect(data).toEqual([
			{
				name: 'chicken',
				prices: [{ usd: 3.29 }, { usd: 2.99 }, { usd: 3.79 }],
			},
			{
				name: 'beef',
				prices: [{ usd: 5.29 }, { usd: 4.49 }],
			},
		]);
	});
});
