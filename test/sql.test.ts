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

	it('should support positional parameters', async () => {
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

	it('should not allow named parameters in template literals', async () => {
		// Test : prefix
		const colonQuery = async () =>
			await sql`INSERT INTO groceries (name) VALUES (:name)`;
		await expect(colonQuery).rejects.toThrow(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);

		// Test @ prefix
		const atQuery = async () =>
			await sql`INSERT INTO groceries (name) VALUES (@name)`;
		await expect(atQuery).rejects.toThrow(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);

		// Test $ prefix
		const dollarQuery = async () =>
			await sql`INSERT INTO groceries (name) VALUES ($name)`;
		await expect(dollarQuery).rejects.toThrow(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);

		// Test complex $ syntax with ::
		const dollarComplexQuery = async () =>
			await sql`SELECT * FROM groceries WHERE id = $ns::param`;
		await expect(dollarComplexQuery).rejects.toThrow(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);

		// Test complex $ syntax with ()
		const dollarParenQuery = async () =>
			await sql`SELECT * FROM groceries WHERE id = $param()`;
		await expect(dollarParenQuery).rejects.toThrow(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);
	});

	it('should not allow numbered positional parameters in template literals', async () => {
		// Test ?1 syntax
		const numbered1Query = async () =>
			await sql`INSERT INTO groceries (name) VALUES (?1)`;
		await expect(numbered1Query).rejects.toThrow(
			'Numbered positional parameters (?1, ?2, etc.) not supported with template literals. Use sql(string, ...params) instead.'
		);

		// Test multiple numbered parameters
		const multiNumberedQuery = async () =>
			await sql`INSERT INTO groceries (name) VALUES (?1, ?2)`;
		await expect(multiNumberedQuery).rejects.toThrow(
			'Numbered positional parameters (?1, ?2, etc.) not supported with template literals. Use sql(string, ...params) instead.'
		);

		// Test ?123 (multi-digit)
		const multiDigitQuery = async () =>
			await sql`SELECT * FROM groceries WHERE id = ?123`;
		await expect(multiDigitQuery).rejects.toThrow(
			'Numbered positional parameters (?1, ?2, etc.) not supported with template literals. Use sql(string, ...params) instead.'
		);
	});

	it('should ignore parameters in string literals and comments', async () => {
		// Named parameter in single-quoted string should be ignored
		const stringLiteral =
			await sql`INSERT INTO groceries (name) VALUES (':notaparam')`;
		expect(stringLiteral).toEqual([]);

		// Named parameter in line comment should be ignored
		const lineComment = await sql`  
    INSERT INTO groceries (name) VALUES ('test') -- :notaparam  
  `;
		expect(lineComment).toEqual([]);

		// Named parameter in block comment should be ignored
		const blockComment = await sql`  
    INSERT INTO groceries (name) VALUES ('test') /* :notaparam @notaparam $notaparam */  
  `;
		expect(blockComment).toEqual([]);

		// Numbered parameter in string should be ignored
		const numberedInString =
			await sql`INSERT INTO groceries (name) VALUES ('?1')`;
		expect(numberedInString).toEqual([]);

		// Numbered parameter in comment should be ignored
		const numberedInComment = await sql`  
    INSERT INTO groceries (name) VALUES ('test') -- ?1 ?2  
  `;
		expect(numberedInComment).toEqual([]);

		// Escaped quotes in strings should be handled correctly
		const escapedQuotes =
			await sql`INSERT INTO groceries (name) VALUES ('it''s :notaparam')`;
		expect(escapedQuotes).toEqual([]);
	});

	it('should allow regular ? placeholders in template literals', async () => {
		// This should work - regular ? placeholders are fine
		const item = 'bread';
		const insert1 =
			await sql`INSERT INTO groceries (name) VALUES (${item}) RETURNING name`;
		expect(insert1).toEqual([{ name: 'bread' }]);

		// Multiple regular ? placeholders
		const item2 = 'milk';
		const quantity = 2;
		await sql`CREATE TABLE IF NOT EXISTS items (name TEXT, qty INTEGER)`;
		const insert2 =
			await sql`INSERT INTO items (name, qty) VALUES (${item2}, ${quantity}) RETURNING *`;
		expect(insert2).toEqual([{ name: 'milk', qty: 2 }]);
		await sql`DROP TABLE items`;
	});
});
