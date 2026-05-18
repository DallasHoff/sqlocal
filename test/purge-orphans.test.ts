import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLocal } from '../src/index.js';

const path = 'purge-orphans-test.sqlite3';
const unrelated = 'purge-orphan-unrelated.sqlite3';

async function listNames(): Promise<string[]> {
	const root = await navigator.storage.getDirectory();
	const out: string[] = [];
	for await (const n of root.keys()) out.push(n);
	return out;
}

async function plant(name: string): Promise<void> {
	const root = await navigator.storage.getDirectory();
	const h = await root.getFileHandle(name, { create: true });
	const w = await (h as any).createWritable();
	await w.write(new Uint8Array(16));
	await w.close();
}

const owned = (n: string) =>
	n === path ||
	n === unrelated ||
	(n.startsWith('backup-') && n.endsWith(`--${path}`)) ||
	n === `${path}-wal` ||
	n === `${path}-shm` ||
	n === `${path}-journal`;

async function cleanup() {
	const root = await navigator.storage.getDirectory();
	for await (const n of root.keys()) {
		if (owned(n)) await root.removeEntry(n).catch(() => {});
	}
}

describe('purgeOrphans (opfs)', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('removes the main file, sidecars, and backup-* orphans', { timeout: 5000 }, async () => {
		const db = new SQLocal({ databasePath: path });
		await db.sql`CREATE TABLE t (id INTEGER PRIMARY KEY)`;
		await db.destroy();

		await plant(`backup-1700000000--${path}`);
		await plant(`backup-1700000001--${path}`);
		await plant(unrelated);

		const removed = await new SQLocal({ databasePath: path }).purgeOrphans();
		expect(removed).toEqual(
			expect.arrayContaining([
				path,
				`backup-1700000000--${path}`,
				`backup-1700000001--${path}`,
			])
		);
		expect(removed).not.toContain(unrelated);

		const after = await listNames();
		expect(after).not.toContain(path);
		expect(after).toContain(unrelated);
	});

	it('returns [] for memory / kvvfs drivers', async () => {
		expect(await new SQLocal({ databasePath: ':memory:' }).purgeOrphans()).toEqual([]);
		expect(await new SQLocal({ databasePath: ':localStorage:' }).purgeOrphans()).toEqual([]);
	});
});
