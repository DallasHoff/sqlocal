import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('init', () => {
	const { sql,  } = new SQLocal({
		storage: {
			type: 'memory',
		},
	});
	
	let dbContent = 

	beforeEach(async () => {
		console.log('memory');
		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		console.log('memory2');
		await sql`INSERT INTO nums (num) VALUES (0)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	it('should enable read-only mode', async () => {
		const { sql, destroy } = new SQLocal({
			storage: {
				type: 'memory',
			},
			readOnly: true,
		});

		const write = async () => {
			await sql`INSERT INTO nums (num) VALUES (1)`;
		};
		expect(write).rejects.toThrowError(
			'SQLITE_IOERR_WRITE: sqlite3 result code 778: disk I/O error'
		);

		const read = async () => {
			return await sql`SELECT * FROM nums`;
		};
		const data = await read();
		expect(data).toEqual([{ num: 0 }]);

		await destroy();
	});
});
