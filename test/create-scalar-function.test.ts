import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'create-scalar-function-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('createScalarFunction ($type)', ({ path, type }) => {
	const { sql, createScalarFunction } = new SQLocal(path);

	beforeEach(async () => {
		await sql`CREATE TABLE nums (num REAL NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	it('should create and use scalar function in columns clause', async () => {
		await createScalarFunction('double', (num: number) => num * 2);

		const createBadFn = async () =>
			await createScalarFunction('double', (num: number) => num * 3);
		await expect(createBadFn).rejects.toThrowError();

		await sql`INSERT INTO nums (num) VALUES (0), (2), (3.5), (-11.11)`;

		const results = await sql`SELECT num, double(num) as doubled FROM nums`;

		expect(results).toEqual([
			{ num: 0, doubled: 0 },
			{ num: 2, doubled: 4 },
			{ num: 3.5, doubled: 7 },
			{ num: -11.11, doubled: -22.22 },
		]);
	});

	it('should create and use scalar function in where clause', async () => {
		await createScalarFunction('isEven', (num: number) => num % 2 === 0);

		await sql`INSERT INTO nums (num) VALUES (2), (3), (4), (5), (6)`;

		const results1 = await sql`SELECT num FROM nums WHERE isEven(num)`;
		expect(results1).toEqual([{ num: 2 }, { num: 4 }, { num: 6 }]);

		const results2 = await sql`SELECT * FROM nums WHERE isEven(num) != TRUE`;
		expect(results2).toEqual([{ num: 3 }, { num: 5 }]);
	});

	it('should enable the REGEXP syntax', async () => {
		await createScalarFunction('regexp', (pattern: string, value: unknown) => {
			const regexp = new RegExp(pattern);
			return regexp.test(String(value));
		});

		await sql`INSERT INTO nums (num) VALUES (29), (328), (4578), (59), (60), (5428)`;

		const results1 = await sql`SELECT num FROM nums WHERE num REGEXP '9$'`;
		expect(results1).toEqual([{ num: 29 }, { num: 59 }]);

		const results2 = await sql`SELECT num FROM nums WHERE num REGEXP '\\d{3}'`;
		expect(results2).toEqual([{ num: 328 }, { num: 4578 }, { num: 5428 }]);

		const results3 =
			await sql`SELECT num FROM nums WHERE num REGEXP '^(4|5).*[89]$'`;
		expect(results3).toEqual([{ num: 4578 }, { num: 59 }, { num: 5428 }]);
	});

	it('should not overwrite a function from a different client instance', async () => {
		const db1 = new SQLocal(type === 'opfs' ? 'dupe-fn-db1.sqlite3' : path);
		const db2 = new SQLocal(type === 'opfs' ? 'dupe-fn-db2.sqlite3' : path);

		await db1.createScalarFunction('addTax', (num: number) => num * 1.06);
		await db2.createScalarFunction('addTax', (num: number) => num * 1.07);

		const [result1] = await db1.sql`SELECT addTax(2) as withTax`;
		const [result2] = await db2.sql`SELECT addTax(2) as withTax`;

		expect(result1.withTax).toBe(2.12);
		expect(result2.withTax).toBe(2.14);
	});
});
