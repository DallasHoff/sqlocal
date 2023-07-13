import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocalDrizzle } from '../../src/drizzle';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { desc, eq } from 'drizzle-orm';

describe('drizzle driver', () => {
	const { sql, driver } = new SQLocalDrizzle('drizzle-driver-test.sqlite3');
	const db = drizzle(driver);

	const groceries = sqliteTable('groceries', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
	});

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
	});

	it('should execute queries with Drizzle ORM', async () => {
		const items = ['bread', 'milk', 'rice'];
		for (let item of items) {
			const insert1 = await db
				.insert(groceries)
				.values({ name: item })
				.returning({ name: groceries.name })
				.get();
			expect(insert1).toEqual({ name: item });
		}

		const select1 = await db.select().from(groceries).all();
		expect(select1).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 2, name: 'milk' },
			{ id: 3, name: 'rice' },
		]);

		const delete1 = await db.delete(groceries).where(eq(groceries.id, 2)).returning().get();
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
});
