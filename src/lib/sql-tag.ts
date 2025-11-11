import type { Statement } from '../types.js';

export function sqlTag(
	queryTemplate: TemplateStringsArray,
	...params: unknown[]
): Statement {
	const sqlText = queryTemplate.join('?');

	// Remove string literals and comments first
	let cleaned = sqlText
		.replace(/'(?:[^']|'')*'/g, '')
		.replace(/"(?:[^"]|"")*"/g, '')
		.replace(/--[^\n]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');

	// Check for named parameters
	const hasSimpleParams = /[:@][\w$\u0080-\uFFFF]+/.test(cleaned);
	const hasDollarParams =
		/\$[\w$\u0080-\uFFFF]+(?:::[:\w$\u0080-\uFFFF]*)*(?:\([^)]*\))?/.test(
			cleaned
		);

	// Check for numbered positional parameters
	const hasNumberedParams = /\?\d+/.test(cleaned);

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

	return {
		sql: queryTemplate.join('?'),
		params,
	};
}
