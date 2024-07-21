import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SQLocal } from '../src/index';
import { createEffectChecker } from './test-utils/create-effect-checker';

describe('destroy', () => {
	const databasePath = 'destroy-test.sqlite3';
	const { sql, destroy } = new SQLocal({ databasePath, reactive: true });
	const nextEffectTables = createEffectChecker(databasePath);

	beforeEach(async () => {
		await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`;
	});

	afterEach(async () => {
		const { sql } = new SQLocal(databasePath);
		await sql`DROP TABLE groceries`;
	});

	it('should destroy the client', async () => {
		const insert1 =
			await sql`INSERT INTO groceries (name) VALUES ('pasta') RETURNING name`;
		expect(insert1).toEqual([{ name: 'pasta' }]);

		const effectTables1 = await nextEffectTables('mutation');
		expect(effectTables1).toEqual(['groceries']);

		await destroy();

		const insert2Fn = async () =>
			await sql`INSERT INTO groceries (name) VALUES ('sauce') RETURNING name`;
		await expect(insert2Fn).rejects.toThrowError();

		const effectTables2 = await nextEffectTables('mutation');
		expect(effectTables2).toEqual(null);
	});
});
