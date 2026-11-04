/**
 * Quote an identifier (a table, index, or schema name) for interpolation into
 * SQL. SQLite escapes a double quote inside a quoted identifier by doubling it.
 * @see https://sqlite.org/lang_keywords.html
 */
export function quoteIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}
