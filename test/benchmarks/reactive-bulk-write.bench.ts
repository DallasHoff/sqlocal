import { bench, describe } from 'vitest';
import { SQLocal } from '../../src/client.js';
import { testVariation } from '../test-utils/test-variation.js';

describe.each(testVariation('reactive-bulk-write-bench'))(
	'reactive bulk write ($type)',
	async ({ path }) => {
		bench('query after bulk write with reactive queries enabled', async () => {
			const db = new SQLocal({
				databasePath: path,
				reactive: true,
			});

			await db.sql`DROP TABLE IF EXISTS t`;
			await db.sql`CREATE TABLE t (id INTEGER PRIMARY KEY)`;

			for (let i = 0; i < 10; i++) {
				await db.batch((sql) => {
					return new Array(500)
						.fill(null)
						.map((_, j) => sql`INSERT INTO t (id) VALUES (${i * 500 + j})`);
				});
			}

			const start = performance.now();
			await db.sql`DELETE FROM t WHERE id >= 10`;
			await db.sql`SELECT 1`;
			const elapsed = performance.now() - start;

			console.log(`DELETE and SELECT: ${elapsed.toFixed(0)}ms`);
			await db.destroy();
		});
	}
);
