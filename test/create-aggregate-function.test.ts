import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'create-aggregate-function-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
	{ type: 'local', path: ':localStorage:' },
	{ type: 'session', path: ':sessionStorage:' },
])('createAggregateFunction ($type)', ({ path }) => {
	const { sql, createAggregateFunction } = new SQLocal(path);

	beforeEach(async () => {
		await sql`CREATE TABLE nums (num REAL NOT NULL)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	it('should create and use aggregate function in columns clause', async () => {
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

		const createBadFn = async () => {
			await createAggregateFunction('mostCommon', {
				step: () => {},
				final: () => 0,
			});
		};
		await expect(createBadFn).rejects.toThrowError();

		await sql`INSERT INTO nums (num) VALUES (0), (3), (2), (7), (3), (1), (5), (3), (3), (2)`;

		const results = await sql`SELECT mostCommon(num) as mostCommon FROM nums`;

		expect(results).toEqual([{ mostCommon: 3 }]);
	});
});
