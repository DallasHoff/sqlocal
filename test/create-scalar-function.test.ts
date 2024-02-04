import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('createScalarFunction', () => {
	const { sql, createScalarFunction } = new SQLocal(
		'create-scalar-function-test.sqlite3'
	);

	beforeEach(async () => {
		await sql`CREATE TABLE nums (num REAL NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	it('should create and use scalar function', async () => {
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
});
