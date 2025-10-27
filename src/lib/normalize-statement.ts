import type { BindableValue, BindingSpec } from '@sqlite.org/sqlite-wasm';
import type { RunnableQuery as DrizzleQuery } from 'drizzle-orm/runnable-query';
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy';
import type { StatementInput, Statement } from '../types.js';
import { sqlTag } from './sql-tag.js';

type NormalStatement = Statement & {
	exec?: <T extends Record<string, any>>() => Promise<T[]>;
};

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

export function normalizeStatement(statement: StatementInput): NormalStatement {
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
			const exec =
				'all' in statement && typeof statement.all === 'function'
					? statement.all
					: undefined;
			return {
				...drizzleStatement,
				exec: exec ? () => exec() : undefined,
			};
		} catch {
			throw new Error('The passed statement could not be parsed.');
		}
	}

	const sql = statement.sql;
	let params: BindingSpec = [];

	if ('params' in statement) {
		params = statement.params;
	} else if ('parameters' in statement) {
		params = statement.parameters as BindableValue[];
	}

	return { sql, params };
}
