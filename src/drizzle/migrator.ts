// ref https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/migrator.ts
import { sql } from 'drizzle-orm';
import type {
	KitConfig,
	MigrationConfig,
	MigrationMeta,
} from 'drizzle-orm/migrator';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

async function readFile(name: string): Promise<string> {
	const path = `${name}?raw`;
	return (await import(path)).default;
}

async function digestMessage(message: string) {
	const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); // hash the message
	const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, '0'))
		.join(''); // convert bytes to hex string
	return hashHex;
}

export async function readMigrationFiles(
	config: string | MigrationConfig
): Promise<MigrationMeta[]> {
	let migrationFolderTo: string | undefined;
	if (typeof config === 'string') {
		const configAsString = await readFile(config);
		const jsonConfig = JSON.parse(configAsString) as KitConfig;
		migrationFolderTo = jsonConfig.out;
	} else {
		migrationFolderTo = config.migrationsFolder;
	}

	if (!migrationFolderTo) {
		throw new Error('no migration folder defined');
	}

	const migrationQueries: MigrationMeta[] = [];

	const journalPath = await readFile(`${migrationFolderTo}/meta/_journal.json`);
	if (!journalPath) {
		throw new Error(`Can't find meta/_journal.json file`);
	}

	const journalAsString = await readFile(
		`${migrationFolderTo}/meta/_journal.json`
	);

	const journal = JSON.parse(journalAsString) as {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};

	for (const journalEntry of journal.entries) {
		const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;

		try {
			const query = await readFile(
				`${migrationFolderTo}/${journalEntry.tag}.sql`
			);

			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: await digestMessage(query),
			});
		} catch {
			throw new Error(
				`No file ${migrationPath} found in ${migrationFolderTo} folder`
			);
		}
	}

	return migrationQueries;
}

// ref https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sqlite-core/dialect.ts#L615
export async function migrate<TSchema extends Record<string, unknown>>(
	db: SqliteRemoteDatabase<TSchema>,
	config: string | MigrationConfig
) {
	const migrations = await readMigrationFiles(config);

	const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
	await db.run(migrationTableCreate);

	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;
	await db.run(sql`BEGIN`);

	try {
		for (const migration of migrations) {
			if (
				!lastDbMigration ||
				Number(lastDbMigration[2])! < migration.folderMillis
			) {
				for (const stmt of migration.sql) {
					await db.run(sql.raw(stmt));
				}
				await db.run(
					sql`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
				);
			}
		}

		await db.run(sql`COMMIT`);
	} catch (e) {
		await db.run(sql`ROLLBACK`);
		throw e;
	}
}
