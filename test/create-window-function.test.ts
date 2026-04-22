import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';
import { testVariation } from './test-utils/test-variation.js';

describe.each(testVariation('create-window-function'))(
	'createWindowFunction ($type)',
	({ path }) => {
		const { sql, createWindowFunction } = new SQLocal(path);

		beforeAll(async () => {
			const values: number[] = [];

			const calcRange = () => {
				if (values.length === 0) return null;
				const min = values[0];
				const max = values[values.length - 1];
				return max - min;
			};

			await createWindowFunction('range', {
				step: (value) => {
					if (typeof value !== 'number') return;
					const idx = values.findIndex((v) => v > value);
					if (idx === -1) {
						values.push(value);
					} else {
						values.splice(idx, 0, value);
					}
				},
				inverse: (value) => {
					if (typeof value !== 'number') return;
					const idx = values.indexOf(value);
					if (idx !== -1) values.splice(idx, 1);
				},
				value: calcRange,
				final: calcRange,
			});
		});

		beforeEach(async () => {
			await sql`CREATE TABLE graph (
        sample INTEGER PRIMARY KEY AUTOINCREMENT,
        value REAL NOT NULL
      )`;
		});

		afterEach(async () => {
			await sql`DROP TABLE graph`;
		});

		it('should create and use window function in SELECT clause', async () => {
			await sql`INSERT INTO graph (value) VALUES (3), (5), (1), (9), (7), (6), (2), (0)`;

			const results = await sql`
        SELECT
          value,
          range(value) OVER (
            ORDER BY sample
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
          ) AS rangeOverLast3
        FROM graph;
      `;

			expect(results).toEqual([
				{ value: 3, rangeOverLast3: 0 },
				{ value: 5, rangeOverLast3: 2 },
				{ value: 1, rangeOverLast3: 4 },
				{ value: 9, rangeOverLast3: 8 },
				{ value: 7, rangeOverLast3: 8 },
				{ value: 6, rangeOverLast3: 3 },
				{ value: 2, rangeOverLast3: 5 },
				{ value: 0, rangeOverLast3: 6 },
			]);
		});

		it('should not replace an existing implementation', async () => {
			const createBadFn = async () => {
				await createWindowFunction('range', {
					step: () => {},
					inverse: () => {},
					value: () => 0,
					final: () => 0,
				});
			};

			await expect(createBadFn).rejects.toThrowError();
		});
	}
);
