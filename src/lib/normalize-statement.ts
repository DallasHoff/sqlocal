import type { RunnableQuery as DrizzleQuery } from 'drizzle-orm/runnable-query';
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy';
import type { StatementInput, Statement } from '../types.js';
import { sqlTag } from './sql-tag.js';

function isDrizzleStatement<Result = unknown>(
	statement: StatementInput<Result>
): statement is DrizzleQuery<
	Result extends SqliteRemoteResult<unknown> ? any : Result[],
	'sqlite'
> {
	return (
		typeof statement === 'object' &&
		statement !== null &&
		'getSQL' in statement &&
		typeof statement.getSQL === 'function'
	);
}

function isStatement(statement: unknown): statement is Statement {
	return (
		typeof statement === 'object' &&
		statement !== null &&
		'sql' in statement === true &&
		typeof statement.sql === 'string' &&
		'params' in statement === true
	);
}

export function normalizeStatement(statement: StatementInput): Statement {
	if (typeof statement === 'function') {
		statement = statement(sqlTag);
	}

	if (isDrizzleStatement(statement)) {
		try {
			if (!('toSQL' in statement && typeof statement.toSQL === 'function')) {
				throw 1;
			}
			const drizzleStatement = statement.toSQL();
			if (!isStatement(drizzleStatement)) {
				throw 2;
			}
			return drizzleStatement;
		} catch {
			throw new Error('The passed statement could not be parsed.');
		}
	}

	const sql = statement.sql;
	let params: unknown[] = [];

	if ('params' in statement) {
		params = statement.params;
	} else if ('parameters' in statement) {
		params = statement.parameters as unknown[];
	}

	return { sql, params };
}
