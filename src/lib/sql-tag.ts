import type { Statement } from '../types.js';

export function sqlTag(
	queryTemplate: TemplateStringsArray,
	...params: unknown[]
): Statement {
	// Check if the SQL contains named parameters
	const sqlText = queryTemplate.join('?');
	const hasNamedParams = /[:@$]\w+/.test(sqlText);

	if (hasNamedParams) {
		// For named params, return SQL as-is with params as object
		// This would require a different API - template literals don't work well with named params
		throw new Error(
			'Named parameters not supported with template literals. Use sql(string, object) instead.'
		);
	}

	return {
		sql: queryTemplate.join('?'),
		params,
	};
}
