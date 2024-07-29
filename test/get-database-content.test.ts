import { afterEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';

describe('getDatabaseContent', () => {
	const fileName = 'get-database-file-test.sqlite3';
	let isOpfsTest = false;

	afterEach(async () => {
		if (!isOpfsTest) return;
		const opfs = await navigator.storage.getDirectory();
		await opfs.removeEntry(fileName);
		isOpfsTest = false;
	});

	it('should return the requested database content on opfs', async () => {
		isOpfsTest = true;
		const { sql, getDatabaseContent, getDatabaseInfo } = new SQLocal(fileName);

		await sql`CREATE TABLE nums (num REAL NOT NULL)`;

		const content = await getDatabaseContent();
		expect(content).toBeInstanceOf(Uint8Array);
	});

	it('should return the requested database content in memory', async () => {
		const { sql, getDatabaseContent } = new SQLocal({
			storage: {
				type: 'memory',
			},
		});

		await sql`CREATE TABLE nums (num REAL NOT NULL)`;
		const content = await getDatabaseContent();

		expect(content).toBeInstanceOf(Uint8Array);
	});
});
