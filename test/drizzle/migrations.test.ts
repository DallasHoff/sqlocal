import { describe, expect, it } from 'vitest';

import { readMigrationFiles, migrate } from '../../src/drizzle/migrator';
import { SQLocalDrizzle } from '../../src/drizzle';

import { MigrationConfig } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

describe('migrator', () => {
	const { driver, sql } = new SQLocalDrizzle('drizzle-driver-test.sqlite3');
	const db = drizzle(driver);
	const config: MigrationConfig = {
		migrationsFolder: '../../test/drizzle/migrations/drizzle',
	};

	it('readMigrationFiles should read files', async () => {
		const result = await readMigrationFiles(config);
		expect(result).toBeTruthy();
	});

	it('should migrate', async () => {
		await migrate(db, config);

		const tables = (
			await sql`SELECT name FROM sqlite_schema WHERE type='table'`
		).map(({ name }) => name);

		for (const tableName of ['cities', 'countries']) {
			expect(tables.includes(tableName)).toBeTruthy();
		}
	});
});
