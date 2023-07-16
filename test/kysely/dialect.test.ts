import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocalKysely } from '../../src/kysely';
import { Generated, Kysely } from 'kysely';

describe('kysely dialect', () => {
	const { dialect } = new SQLocalKysely('kysely-dialect-test.sqlite3');
	const db = new Kysely<DB>({ dialect });

	type DB = {
		groceries: {
			id: Generated<number>;
			name: string;
		};
	};

	beforeEach(async () => {
		await db.schema
			.createTable('groceries')
			.addColumn('id', 'integer', (cb) => cb.primaryKey().autoIncrement())
			.addColumn('name', 'text', (cb) => cb.notNull())
			.execute();
	});

	afterEach(async () => {
		await db.schema.dropTable('groceries').execute();
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

	it('should perform successful transaction', async () => {
		await db.transaction().execute(async (trx) => {
			await trx.insertInto('groceries').values({ name: 'apples' }).execute();
			await trx.insertInto('groceries').values({ name: 'bananas' }).execute();
		});

		const data = await db.selectFrom('groceries').selectAll().execute();
		expect(data.length).toBe(2);
	});

	it('should rollback failed transaction', async () => {
		await db
			.transaction()
			.execute(async (trx) => {
				await trx.insertInto('groceries').values({ name: 'carrots' }).execute();
				await trx
					.insertInto('groeries' as any)
					.values({ name: 'lettuce' })
					.execute();
			})
			.catch(() => {});

		const data = await db.selectFrom('groceries').selectAll().execute();
		expect(data.length).toBe(0);
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
});
