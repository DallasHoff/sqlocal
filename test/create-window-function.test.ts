import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';
import { testVariation } from './test-utils/test-variation.js';

describe.each(testVariation('create-window-function'))(
	'createWindowFunction ($type)',
	({ path }) => {
		const { sql, createWindowFunction } = new SQLocal(path);

		beforeAll(async () => {
			let values: number[] = [];

			const calcRange = (isFinal: boolean) => {
				if (values.length === 0) return null;
				const min = values[0];
				const max = values[values.length - 1];
				if (isFinal) values = [];
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
				value: () => calcRange(false),
				final: () => calcRange(true),
			});
		});

		beforeEach(async () => {
			await sql`CREATE TABLE tracking (
        sampleIndex INTEGER PRIMARY KEY AUTOINCREMENT,
        value REAL NOT NULL
      )`;
			await sql`INSERT INTO tracking (value) 
      VALUES (3), (5), (1), (9), (7), (6), (2), (0)`;
		});

		afterEach(async () => {
			await sql`DROP TABLE tracking`;
		});

		it('should create and use window function in SELECT clause', async () => {
			const results = await sql`
        SELECT
          value,
          range(value) OVER (
            ORDER BY sampleIndex
            ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
          ) AS rangeOver3
        FROM tracking;
      `;

			expect(results).toEqual([
				{ value: 3, rangeOver3: 2 },
				{ value: 5, rangeOver3: 4 },
				{ value: 1, rangeOver3: 8 },
				{ value: 9, rangeOver3: 8 },
				{ value: 7, rangeOver3: 3 },
				{ value: 6, rangeOver3: 5 },
				{ value: 2, rangeOver3: 6 },
				{ value: 0, rangeOver3: 2 },
			]);
		});

		it('should also work as a regular aggregate function', async () => {
			const results1 = await sql`
        SELECT range(value) AS range FROM tracking;
      `;
			expect(results1).toEqual([{ range: 9 }]);

			const results2 = await sql`
        SELECT range(value) AS range FROM tracking WHERE value > 2;
      `;
			expect(results2).toEqual([{ range: 6 }]);
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
