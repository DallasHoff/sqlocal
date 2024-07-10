import { describe, expect, it } from 'vitest';
import { parseQueryEffects } from '../../src/lib/parse-query-effects';

describe('parseQueryEffects', () => {
	it('should throw when passed invalid SQL', () => {
		expect(() => parseQueryEffects('')).toThrow();
		expect(() => parseQueryEffects('SELEC * FROM a')).toThrow();
	});

	it('should parse the tables referenced in some SQL', () => {
		// SELECT
		expect(parseQueryEffects('SELECT * FROM a')).toEqual({
			readTables: ['a'],
			mutatedTables: [],
		});
		expect(parseQueryEffects('SELECT * FROM foo AS f')).toEqual({
			readTables: ['foo'],
			mutatedTables: [],
		});
		expect(parseQueryEffects('SELECT name FROM a WHERE id = ?')).toEqual({
			readTables: ['a'],
			mutatedTables: [],
		});
		expect(parseQueryEffects('SELECT * FROM a, b')).toEqual({
			readTables: ['a', 'b'],
			mutatedTables: [],
		});
		expect(parseQueryEffects('SELECT * FROM a CROSS JOIN b')).toEqual({
			readTables: ['a', 'b'],
			mutatedTables: [],
		});
		expect(parseQueryEffects('SELECT * FROM aa AS a, bb')).toEqual({
			readTables: ['aa', 'bb'],
			mutatedTables: [],
		});
		expect(parseQueryEffects('SELECT * FROM aa, bb AS b WHERE id = 1')).toEqual(
			{
				readTables: ['aa', 'bb'],
				mutatedTables: [],
			}
		);
		expect(
			parseQueryEffects('SELECT * FROM x WHERE id IN (SELECT id FROM y)')
		).toEqual({
			readTables: ['x', 'y'],
			mutatedTables: [],
		});
		expect(
			parseQueryEffects(
				'SELECT label FROM products LEFT JOIN labels ON products.id = labels.id'
			)
		).toEqual({
			readTables: ['products', 'labels'],
			mutatedTables: [],
		});
		expect(
			parseQueryEffects(
				'WITH average_salaries AS (SELECT department, AVG(salary) AS avg_salary FROM payroll GROUP BY department) SELECT e.id, e.name, e.department, e.salary, a.avg_salary FROM employees e JOIN average_salaries a ON e.department = a.department WHERE e.salary > a.avg_salary'
			)
		).toEqual({
			readTables: ['payroll', 'employees'],
			mutatedTables: [],
		});

		// INSERT
		expect(
			parseQueryEffects(
				"INSERT INTO employees (id, name, position) VALUES (1, 'Alice', 'Engineer')"
			)
		).toEqual({
			readTables: [],
			mutatedTables: ['employees'],
		});
		expect(
			parseQueryEffects(
				"INSERT INTO archivedEmployees (id, name, position, archived_date) SELECT id, name, position, '2024-07-09' FROM employees WHERE id = 1"
			)
		).toEqual({
			readTables: ['employees'],
			mutatedTables: ['archivedemployees'],
		});

		// UPDATE
		expect(
			parseQueryEffects(
				"UPDATE employees SET salary = 80000 WHERE firstName = 'Ryley' AND lastName = 'Robinson'"
			)
		).toEqual({
			readTables: [],
			mutatedTables: ['employees'],
		});
		expect(
			parseQueryEffects(
				"UPDATE employees SET salary = (SELECT AVG(salary) FROM payroll) WHERE position = 'Tester'"
			)
		).toEqual({
			readTables: ['payroll'],
			mutatedTables: ['employees'],
		});

		// DELETE
		expect(
			parseQueryEffects('DELETE FROM payroll WHERE salary > 200000')
		).toEqual({
			readTables: [],
			mutatedTables: ['payroll'],
		});
		expect(
			parseQueryEffects(
				'DELETE FROM employees WHERE id IN (SELECT employeeId FROM payroll WHERE salary > 200000)'
			)
		).toEqual({
			readTables: ['payroll'],
			mutatedTables: ['employees'],
		});
	});
});
