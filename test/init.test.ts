import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { SQLocal } from '../src/index.js';

describe.each([
	{ type: 'opfs', path: 'init-test.sqlite3' },
	{ type: 'memory', path: ':memory:' },
])('init ($type)', ({ path, type }) => {
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
		expect(crossOriginIsolated).toBe(true);
	});

	it('should or should not create a file in the OPFS', async () => {
		const opfs = await navigator.storage.getDirectory();

		if (type === 'opfs') {
			const fileHandle = await opfs.getFileHandle(path);
			const file = await fileHandle.getFile();
			expect(file.size).toBeGreaterThan(0);
		} else {
			await expect(opfs.getFileHandle(path)).rejects.toThrowError();
		}
	});

	it('should call onInit and onConnect', async () => {
		let onInitCalled = false;
		let onConnectCalled = false;

		const db = new SQLocal({
			databasePath: path,
			onInit: () => {
				onInitCalled = true;
			},
			onConnect: () => {
				onConnectCalled = true;
			},
		});

		expect(onInitCalled).toBe(true);
		await vi.waitUntil(() => onConnectCalled === true);
		await db.destroy();
	});

	it('should enable read-only mode', async () => {
		const { sql, destroy } = new SQLocal({
			databasePath: path,
			readOnly: true,
		});

		const expectedError =
			'SQLITE_READONLY: sqlite3 result code 8: attempt to write a readonly database';

		if (type === 'memory') {
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
});
