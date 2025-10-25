import type { Statement } from '../types.js';
import { sqlTag } from './sql-tag.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSql(
	maybeQueryTemplate: TemplateStringsArray | string,
	params: unknown[]
): Statement {
	let statement: Statement;

	if (typeof maybeQueryTemplate === 'string') {
		// Handle named parameters
		if (params.length === 1 && isRecord(params[0])) {
			statement = { sql: maybeQueryTemplate, params: params[0] };
		} else {
			// Handle positional parameters
			statement = { sql: maybeQueryTemplate, params };
		}
	} else {
		// Handle template literal syntax
		statement = sqlTag(maybeQueryTemplate, ...params);
	}

	return statement;
}
