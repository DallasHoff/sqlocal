import type { Statement } from '../types.js';

export function sqlTag(
	queryTemplate: TemplateStringsArray | string,
	...params: unknown[]
): Statement {
	const normalizedSql =
		typeof queryTemplate === 'string' ? queryTemplate : queryTemplate.join('?');
	const normalizedParams =
		params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

	return {
		sql: normalizedSql,
		params: normalizedParams,
	};
}
