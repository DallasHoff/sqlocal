import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { SQLocal, SQLocalProcessor } from '../src/index.js';
import { SQLiteMemoryDriver } from '../src/drivers/sqlite-memory-driver.js';

describe.each(
	typeof window !== 'undefined'
		? [
				{ type: 'opfs', path: 'init-test.sqlite3' },
				{ type: 'memory', path: ':memory:' },
				{ type: 'local', path: ':localStorage:' },
				{ type: 'session', path: ':sessionStorage:' },
			]
		: [{ type: 'node', path: './.db/init-test.sqlite3' }]
)('init ($type)', ({ path, type }) => {
	const { sql, deleteDatabaseFile } = new SQLocal(path);

	beforeEach(async () => {
		await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
		await sql`INSERT INTO nums (num) VALUES (0)`;
	});

	afterEach(async () => {
		await sql`DROP TABLE nums`;
	});

	afterAll(async () => {
		await deleteDatabaseFile();
	});

	it('should be cross-origin isolated', () => {
		expect(type === 'node' || crossOriginIsolated).toBe(true);
	});

	it('should or should not create a file in the OPFS', async () => {
		if (type !== 'opfs') return;
		const opfs = await navigator.storage.getDirectory();
		const fileHandle = await opfs.getFileHandle(path);
		const file = await fileHandle.getFile();
		expect(file.size).toBeGreaterThan(0);
	});

	it('should call onInit and onConnect', async () => {
		let onInitCalled = false;
		let onConnectCalled = false;

		const { sql, destroy } = new SQLocal({
			databasePath: path,
			onInit: (sql) => {
				onInitCalled = true;
				return [sql`PRAGMA foreign_keys = ON`];
			},
			onConnect: () => {
				onConnectCalled = true;
			},
		});

		expect(onInitCalled).toBe(true);
		await vi.waitUntil(() => onConnectCalled === true);

		const [foreignKeys] = await sql`PRAGMA foreign_keys`;
		expect(foreignKeys).toEqual({ foreign_keys: 1 });

		await destroy();
	});

	it('should enable read-only mode', async () => {
		const { sql, getDatabaseInfo, destroy } = new SQLocal({
			databasePath: path,
			readOnly: true,
		});
		const { storageType } = await getDatabaseInfo();

		const expectedError =
			'SQLITE_READONLY: sqlite3 result code 8: attempt to write a readonly database';

		if (storageType === 'memory') {
			const write = async () => {
				await sql`CREATE TABLE nums (num INTEGER NOT NULL)`;
			};
			await expect(write).rejects.toThrowError(expectedError);

			const data = await sql`SELECT (2 + 2) as result`;
			expect(data).toEqual([{ result: 4 }]);
		} else {
			const write = async () => {
				await sql`INSERT INTO nums (num) VALUES (1)`;
			};
			await expect(write).rejects.toThrowError(expectedError);

			const data = await sql`SELECT * FROM nums`;
			expect(data).toEqual([{ num: 0 }]);
		}

		await destroy();
	});

	it('should accept custom processors', async () => {
		const driver = new SQLiteMemoryDriver();
		const processor = new SQLocalProcessor(driver);
		const db = new SQLocal({ databasePath: ':custom:', processor });
		const info = await db.getDatabaseInfo();

		expect(info).toEqual({
			databasePath: ':custom:',
			databaseSizeBytes: 0,
			storageType: 'memory',
			persisted: false,
		});
	});
});
