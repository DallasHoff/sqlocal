import type { Migration } from 'kysely';
import { Migration20230801 } from './2023-08-01.js';
import { Migration20230802 } from './2023-08-02.js';

export const migrations: Record<string, Migration> = {
	'2023-08-02': Migration20230802,
	'2023-08-01': Migration20230801,
};
