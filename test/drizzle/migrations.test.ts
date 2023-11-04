import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../src/drizzle/migrations';
import { MigrationConfig } from 'drizzle-orm/migrator';

describe('readMigrationFiles', () => {
	it('should read files', async () => {
		const config: MigrationConfig = {
			migrationsFolder: '../../test/drizzle/migrations/drizzle',
		};
		const result = await readMigrationFiles(config);
	});
});
