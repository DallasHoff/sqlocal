// original file https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/migrator.ts
import {
	KitConfig,
	MigrationConfig,
	MigrationMeta,
} from 'drizzle-orm/migrator';

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
