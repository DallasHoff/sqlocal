import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'create-aggregate-function-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('createAggregateFunction ($type)', ({ path }) => {
	const { sql, createAggregateFunction } = new SQLocal(path);

	beforeAll(async () => {
		const values = new Map<unknown, number>();

		await createAggregateFunction('mostCommon', {
			step: (value: unknown) => {
				const valueCount = values.get(value) ?? 0;
				values.set(value, valueCount + 1);
			},
			final: () => {
				const valueEntries = Array.from(values.entries());
				const sortedEntries = valueEntries.sort((a, b) => b[1] - a[1]);
				const mostCommonValue = sortedEntries[0][0];
				values.clear();
				return mostCommonValue;
			},
		});
	});

	beforeEach(async () => {
		await sql`CREATE TABLE nums (num REAL NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	it('should create and use aggregate function in SELECT clause', async () => {
		await sql`INSERT INTO nums (num) VALUES (0), (3), (2), (7), (3), (1), (5), (3), (3), (2)`;

		const results = await sql`SELECT mostCommon(num) AS mostCommon FROM nums`;

		expect(results).toEqual([{ mostCommon: 3 }]);
	});

	it('should create and use aggregate function in HAVING clause', async () => {
		await sql`INSERT INTO nums (num) VALUES (1), (2), (2), (2), (4), (5), (5), (6)`;

		const results = await sql`
			SELECT mod(num, 2) AS isOdd
			FROM nums
			GROUP BY isOdd
			HAVING mostCommon(num) = 5
		`;

		expect(results).toEqual([{ isOdd: 1 }]);
	});

	it('should not replace an existing implementation', async () => {
		const createBadFn = async () => {
			await createAggregateFunction('mostCommon', {
				step: () => {},
				final: () => 0,
			});
		};

		await expect(createBadFn).rejects.toThrowError();
	});
});
