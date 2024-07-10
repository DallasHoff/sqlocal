import { type FromClause, cstVisitor, parse } from 'sql-parser-cst';

export function parseQueryEffects(sql: string): {
	readTables: string[];
	mutatedTables: string[];
} {
	if (!sql) throw new Error('No SQL specified.');

	const readTables = new Set<string>();
	const mutatedTables = new Set<string>();
	const aliases = new Set<string>();

	const addTable = (table: FromClause['expr'], to: Set<string>) => {
		if (table.type === 'identifier') {
			to.add(table.name.toLowerCase());
		} else if (table.type === 'alias' && table.expr.type === 'identifier') {
			to.add(table.expr.name.toLowerCase());
		}
	};

	const cst = parse(sql, { dialect: 'sqlite', paramTypes: ['?'] });

	cstVisitor({
		from_clause: (fromClause) => {
			addTable(fromClause.expr, readTables);
		},
		join_expr: (joinExpr) => {
			addTable(joinExpr.left, readTables);
			addTable(joinExpr.right, readTables);
		},
		common_table_expr: (cte) => {
			aliases.add(cte.table.name.toLowerCase());
		},
		insert_clause: (insertClause) => {
			addTable(insertClause.table, mutatedTables);
		},
		update_clause: (updateClause) => {
			updateClause.tables.items.forEach((table) => {
				addTable(table, mutatedTables);
			});
		},
		delete_clause: (deleteClause) => {
			deleteClause.tables.items.forEach((table) => {
				addTable(table, mutatedTables);
			});
		},
	})(cst);

	return {
		readTables: Array.from(readTables).filter((name) => {
			return !aliases.has(name);
		}),
		mutatedTables: Array.from(mutatedTables).filter((name) => {
			return !aliases.has(name);
		}),
	};
}
