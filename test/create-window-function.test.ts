import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index.js';
import { testVariation } from './test-utils/test-variation.js';

describe.each(testVariation('create-window-function'))(
	'createWindowFunction ($type)',
	({ path }) => {
		const { sql, createWindowFunction } = new SQLocal(path);

		beforeAll(async () => {
			const values = new Map<unknown, number>();

			await createWindowFunction('', {
				step: () => {},
				value: () => {},
				inverse: () => {},
				final: () => {},
			});
		});

		beforeEach(async () => {
			await sql`CREATE TABLE nums (num REAL NOT NULL)`;
		});

		afterEach(async () => {
			await sql`DROP TABLE nums`;
		});
	}
);
