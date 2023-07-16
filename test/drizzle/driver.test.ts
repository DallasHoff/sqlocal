import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocalDrizzle } from '../../src/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { desc, eq, placeholder } from 'drizzle-orm';

describe('drizzle driver', () => {
	const { sql, driver } = new SQLocalDrizzle('drizzle-driver-test.sqlite3');
	const db = drizzle(driver);

	const groceries = sqliteTable('groceries', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
	});

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
	});

	it('should execute queries', async () => {
		const insert1Prepared = db
			.insert(groceries)
			.values({ name: placeholder('name') })
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
});
