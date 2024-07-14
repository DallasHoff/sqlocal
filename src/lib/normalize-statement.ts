import { ReturningStatement, Statement } from '../types.js';

export function normalizeStatement(statement: ReturningStatement): Statement {
	return {
		sql: statement.sql,
		params: ('params' in statement
			? statement.params
			: 'parameters' in statement
				? statement.parameters
				: []) as unknown[],
	};
}
