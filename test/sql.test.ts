import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';
import { testVariation } from './test-utils/test-variation.js';

describe.each(testVariation('sql'))('sql ($type)', ({ path }) => {
	const { sql } = new SQLocal(path);

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE groceries`;
	});

	it('should execute queries', async () => {
		const items = ['bread', 'milk', 'rice'];
		for (let item of items) {
			const insert1 =
				await sql`INSERT INTO groceries (name) VALUES (${item}) RETURNING name`;
			expect(insert1).toEqual([{ name: item }]);
		}

		const select1 = await sql`SELECT * FROM groceries`;
		expect(select1).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 2, name: 'milk' },
			{ id: 3, name: 'rice' },
		]);

		const multiSelect1 =
			await sql`SELECT * FROM groceries WHERE id = ${3}; SELECT * FROM groceries WHERE id = 2;`;
		expect(multiSelect1).toEqual([{ id: 3, name: 'rice' }]);

		const multiSelect2 = async () =>
			await sql`SELECT * FROM groceries WHERE id = ${3}; SELECT * FROM groceries WHERE id = ${2};`;
		await expect(multiSelect2).rejects.toThrow();

		const delete1 = await sql`DELETE FROM groceries WHERE id = 2 RETURNING *`;
		expect(delete1).toEqual([{ id: 2, name: 'milk' }]);

		const update1 =
			await sql`UPDATE groceries SET name = 'white rice' WHERE id = 3 RETURNING name`;
		expect(update1).toEqual([{ name: 'white rice' }]);

		const select2 = await sql`SELECT name FROM groceries ORDER BY id DESC`;
		expect(select2).toEqual([{ name: 'white rice' }, { name: 'bread' }]);

		const sqlStr = 'SELECT name FROM groceries WHERE id = ?';
		const select3 = await sql(sqlStr, 1);
		expect(select3).toEqual([{ name: 'bread' }]);
	});

	it('should execute queries with named parameters', async () => {
		// Test INSERT with named parameters
		const insert1 = await sql(
			'INSERT INTO groceries (name) VALUES (:name) RETURNING name',
			{ name: 'bread' }
		);
		expect(insert1).toEqual([{ name: 'bread' }]);

		const insert2 = await sql(
			'INSERT INTO groceries (name) VALUES ($name) RETURNING name',
			{ name: 'milk' }
		);
		expect(insert2).toEqual([{ name: 'milk' }]);

		const insert3 = await sql(
			'INSERT INTO groceries (name) VALUES (@name) RETURNING name',
			{ name: 'rice' }
		);
		expect(insert3).toEqual([{ name: 'rice' }]);

		// Test SELECT with named parameters
		const select1 = await sql('SELECT * FROM groceries WHERE name = :name', {
			name: 'bread',
		});
		expect(select1).toEqual([{ id: 1, name: 'bread' }]);

		// Test multiple named parameters
		await sql('INSERT INTO groceries (name) VALUES (:item)', { item: 'eggs' });
		const select2 = await sql(
			'SELECT * FROM groceries WHERE id >= :minId AND id <= :maxId ORDER BY id',
			{ minId: 1, maxId: 3 }
		);
		expect(select2).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 2, name: 'milk' },
			{ id: 3, name: 'rice' },
		]);

		// Test UPDATE with named parameters
		const update1 = await sql(
			'UPDATE groceries SET name = :newName WHERE name = :oldName RETURNING *',
			{ newName: 'white rice', oldName: 'rice' }
		);
		expect(update1).toEqual([{ id: 3, name: 'white rice' }]);

		// Test DELETE with named parameters
		const delete1 = await sql(
			'DELETE FROM groceries WHERE id = :id RETURNING *',
			{ id: 2 }
		);
		expect(delete1).toEqual([{ id: 2, name: 'milk' }]);

		// Verify final state
		const selectAll = await sql('SELECT * FROM groceries ORDER BY id');
		expect(selectAll).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 3, name: 'white rice' },
			{ id: 4, name: 'eggs' },
		]);
	});

	it('should handle named parameters with different prefixes', async () => {
		// Test all three SQLite named parameter prefixes
		await sql('INSERT INTO groceries (name) VALUES (:colon)', { colon: 'a' });
		await sql('INSERT INTO groceries (name) VALUES (@at)', { at: 'b' });
		await sql('INSERT INTO groceries (name) VALUES ($dollar)', { dollar: 'c' });

		const results = await sql('SELECT name FROM groceries ORDER BY id');
		expect(results).toEqual([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
	});

	it('should not allow named parameters in template literals', async () => {
		const queryFn = async () =>
			await sql`INSERT INTO groceries (name) VALUES (:name)`;

		await expect(queryFn).rejects.toThrow(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);
	});

	it('should still support positional parameters', async () => {
		// Ensure backward compatibility with positional parameters
		const insert1 = await sql(
			'INSERT INTO groceries (name) VALUES (?) RETURNING name',
			'bread'
		);
		expect(insert1).toEqual([{ name: 'bread' }]);

		const select1 = await sql('SELECT * FROM groceries WHERE id = ?', 1);
		expect(select1).toEqual([{ id: 1, name: 'bread' }]);

		// Multiple positional parameters
		await sql('INSERT INTO groceries (name) VALUES (?)', 'milk');
		await sql('INSERT INTO groceries (name) VALUES (?)', 'rice');

		const select2 = await sql(
			'SELECT * FROM groceries WHERE id >= ? AND id <= ? ORDER BY id',
			1,
			3
		);
		expect(select2).toEqual([
			{ id: 1, name: 'bread' },
			{ id: 2, name: 'milk' },
			{ id: 3, name: 'rice' },
		]);
	});

	it('should handle edge cases with named parameters', async () => {
		// Empty object should work (no parameters)
		const select1 = await sql('SELECT * FROM groceries', {});
		expect(select1).toEqual([]);

		// Unused parameters should be ignored
		await sql('INSERT INTO groceries (name) VALUES (:name)', {
			name: 'bread',
			unused: 'ignored',
		});
		const select2 = await sql('SELECT name FROM groceries WHERE id = 1');
		expect(select2).toEqual([{ name: 'bread' }]);

		// Same parameter used multiple times
		await sql('INSERT INTO groceries (name) VALUES (:item)', { item: 'milk' });
		const select3 = await sql(
			'SELECT * FROM groceries WHERE name = :val OR name = :val',
			{ val: 'milk' }
		);
		expect(select3.length).toBeGreaterThan(0);
	});
});
