import type { BindableValue } from '@sqlite.org/sqlite-wasm';
import type { Statement } from '../types.js';
import { sqlTag } from './sql-tag.js';

function isObject(
	value: unknown
): value is { [paramName: string]: BindableValue } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractNamedParams(sql: string): string[] {
	const params = new Set<string>();

	// Remove string literals and comments first
	let cleaned = sql
		.replace(/'(?:[^']|'')*'/g, '')
		.replace(/"(?:[^"]|"")*"/g, '')
		.replace(/--[^\n]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');

	// Match : and @ parameters
	const simpleParams = cleaned.match(/[:@][\w$\u0080-\uFFFF]+/g) || [];
	simpleParams.forEach((p) => params.add(p));

	// Match $ parameters
	const dollarParams =
		cleaned.match(
			/\$[\w$\u0080-\uFFFF]+(?:::[:\w$\u0080-\uFFFF]*)*(?:\([^)]*\))?/g
		) || [];
	dollarParams.forEach((p) => params.add(p));

	return Array.from(params);
}

function normalizeNamedParams(
	sql: string,
	params: { [paramName: string]: BindableValue }
): { [paramName: string]: BindableValue } {
	const normalizedParams: { [paramName: string]: BindableValue } = {};

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

export function normalizeSql(
	maybeQueryTemplate: TemplateStringsArray | string,
	params: unknown[]
): Statement {
	let statement: Statement;

	if (typeof maybeQueryTemplate === 'string') {
		// Handle named parameters
		if (params.length === 1 && isObject(params[0])) {
			statement = {
				sql: maybeQueryTemplate,
				params: normalizeNamedParams(maybeQueryTemplate, params[0]),
			};
		} else {
			// Handle positional parameters
			statement = {
				sql: maybeQueryTemplate,
				params: params as BindableValue[],
			};
		}
	} else {
		// Handle template literal syntax
		statement = sqlTag(maybeQueryTemplate, ...(params as BindableValue[]));
	}

	return statement;
}
