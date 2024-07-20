import { isSQLWrapper } from 'drizzle-orm';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import type { ReturningStatement, Statement } from '../types.js';
import { sqlTag } from './sql-tag.js';

function isDrizzleStatement<Result = unknown>(
	statement: ReturningStatement<Result>
): statement is RunnableQuery<Result[], 'sqlite'> {
	return isSQLWrapper(statement);
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

export function normalizeStatement(
	statement: ReturningStatement | ((sql: typeof sqlTag) => ReturningStatement)
): Statement {
	if (typeof statement === 'function') {
		statement = statement(sqlTag);
	}

	if (isDrizzleStatement(statement)) {
		if ('toSQL' in statement && typeof statement.toSQL === 'function') {
			const drizzleStatement = statement.toSQL();

			if (isStatement(drizzleStatement)) {
				return drizzleStatement;
			} else {
				throw new Error('The passed Drizzle statement could not be parsed.');
			}
		} else {
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
