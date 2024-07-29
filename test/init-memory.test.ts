import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('init', async () => {
	const { sql, getDatabaseContent } = new SQLocal({
		storage: {
			type: 'memory',
		},
	});

	let dbContent;

	beforeEach(async () => {
		console.log('memory');
		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		console.log('memory2');
		await sql`INSERT INTO nums (num) VALUES (0)`;
		dbContent = await getDatabaseContent();
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	it('should enable read-only mode', async () => {
		const { sql, destroy } = new SQLocal({
			storage: {
				type: 'memory',
				dbContent: dbContent,
			},
			readOnly: true,
		});

		console.log('sending insert');
		const write = async () => {
			await sql`INSERT INTO nums (num) VALUES (1)`;
		};

		expect(write).rejects.toThrowError(
			'SQLITE_READONLY: sqlite3 result code 8: attempt to write a readonly database'
		);

		const read = async () => {
			return await sql`SELECT * FROM nums`;
		};
		const data = await read();
		expect(data).toEqual([{ num: 0 }]);

		await destroy();
	});
});
