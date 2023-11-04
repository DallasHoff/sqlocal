import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readMigrationFiles, migrate } from '../../src/drizzle/migrations';
import { SQLocalDrizzle } from '../../src/drizzle';

//import { sql } from 'drizzle-orm';
import { MigrationConfig } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

describe('migrations', () => {
	const { driver, sql } = new SQLocalDrizzle('drizzle-driver-test.sqlite3');
	const db = drizzle(driver);
	const config: MigrationConfig = {
		migrationsFolder: '../../test/drizzle/migrations/drizzle',
	};

	it('readMigrationFiles should read files', async () => {
		const result = await readMigrationFiles(config);
	});

	it('should migrate', async () => {
		await migrate(
			db,
			async (queries) => {
				console.log(queries);
			},
			config
		);

		const result =
			await sql`SELECT name FROM sqlite_schema WHERE type='table' AND name='__drizzle_migrations'`;

		console.log(result);
	});
});
