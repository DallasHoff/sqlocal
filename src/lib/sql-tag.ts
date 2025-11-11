import type { Statement } from '../types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractNamedParams(sql: string): string[] {
	const params = new Set<string>();

	// Remove string literals and comments first
	let cleanedSql = sql
		.replace(/'(?:[^']|'')*'/g, '')
		.replace(/"(?:[^"]|"")*"/g, '')
		.replace(/--[^\n]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');

	// Match : and @ parameters
	const simpleParams = cleanedSql.match(/[:@][\w$\u0080-\uFFFF]+/g) || [];
	simpleParams.forEach((p) => params.add(p));

	// Match $ parameters
	const dollarParams =
		cleanedSql.match(
			/\$[\w$\u0080-\uFFFF]+(?:::[:\w$\u0080-\uFFFF]*)*(?:\([^)]*\))?/g
		) || [];
	dollarParams.forEach((p) => params.add(p));

	return Array.from(params);
}

function normalizeNamedParams(
	sql: string,
	params: Record<string, unknown>
): Record<string, unknown> {
	const normalizedParams: Record<string, unknown> = {};

	// Find all named parameters in the SQL and their prefixes
	const sqlParams = extractNamedParams(sql);

	// Create a map of param names without prefix to their full names with prefix
	const paramMap = new Map<string, string>();

	for (const sqlParam of sqlParams) {
		const paramName = sqlParam.substring(1); // Remove first char (prefix)
		paramMap.set(paramName, sqlParam);
	}

	// Only include parameters that exist in the SQL
	for (const [key, value] of Object.entries(params)) {
		const sqlParam = paramMap.get(key);
		if (sqlParam) {
			normalizedParams[sqlParam] = value;
		}
		// Silently ignore parameters not in SQL
	}

	return normalizedParams;
}

export function sqlTag(
	maybeQueryTemplate: TemplateStringsArray | string,
	...params: unknown[]
): Statement {
	let statement: Statement;

	if (typeof maybeQueryTemplate === 'string') {
		// Handle named parameters
		if (params.length === 1 && isRecord(params[0])) {
			statement = {
				sql: maybeQueryTemplate,
				params: normalizeNamedParams(maybeQueryTemplate, params[0]),
			};
		} else {
			// Handle positional parameters
			statement = { sql: maybeQueryTemplate, params };
		}
	} else {
		// Handle template literal syntax
		const sqlText = maybeQueryTemplate.join('?');

		// Remove string literals and comments first
		let cleanedSql = sqlText
			.replace(/'(?:[^']|'')*'/g, '')
			.replace(/"(?:[^"]|"")*"/g, '')
			.replace(/--[^\n]*/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '');

		// Check for named parameters
		const hasSimpleParams = /[:@][\w$\u0080-\uFFFF]+/.test(cleanedSql);
		const hasDollarParams =
			/\$[\w$\u0080-\uFFFF]+(?:::[:\w$\u0080-\uFFFF]*)*(?:\([^)]*\))?/.test(
				cleanedSql
			);

		// Check for numbered positional parameters
		const hasNumberedParams = /\?\d+/.test(cleanedSql);

		if (hasSimpleParams || hasDollarParams) {
			throw new Error(
				'Named parameters not supported with template literals. Use sql(string, object) instead.'
			);
		}

		if (hasNumberedParams) {
			throw new Error(
				'Numbered positional parameters (?1, ?2, etc.) not supported with template literals. Use sql(string, ...params) instead.'
			);
		}

		statement = { sql: sqlText, params };
	}

	return statement;
}
