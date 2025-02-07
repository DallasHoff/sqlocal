# createAggregateFunction

Create a SQL function that can be called from queries to combine multiple rows into a single result row.

## Usage

Access or destructure `createAggregateFunction` from the `SQLocal` client.

```javascript
import { SQLocal } from 'sqlocal';

const { createAggregateFunction } = new SQLocal('database.sqlite3');
```

<!-- @include: ../.partials/initialization-note.md -->

This method takes a string to name a custom SQL function as its first argument and an object containing two functions (`step` and `final`) as its second argument. After running `createAggregateFunction`, the aggregate function that you defined can be called from subsequent SQL queries. Arguments passed to the function in the SQL query will be passed to the JavaScript `step` function. The `step` function will run for every row in the SQL query. After each row is processed, the `final` function will run, and its return value will be passed back to SQLite to use to complete the query.

This can be used to combine rows together in a query based on some custom logic. For example, the below aggregate function can be used to find the most common value for a column, such as the most common category used in a table of tasks.

```javascript
const values = new Map();

await createAggregateFunction('mostCommon', {
	step: (value) => {
		const valueCount = values.get(value) ?? 0;
		values.set(value, valueCount + 1);
	},
	final: () => {
		const valueEntries = Array.from(values.entries());
		const sortedEntries = valueEntries.sort((a, b) => b[1] - a[1]);
		const mostCommonValue = sortedEntries[0][0];
		values.clear();
		return mostCommonValue;
	},
});

await sql`SELECT mostCommon(category) AS mostCommonCategory FROM tasks`;
```

Aggregate functions can also be used in a query's HAVING clause to filter groups of rows. Here, we use the `mostCommon` function that we created in the previous example to find which days of the week have "Cleaning" as the most common category of task.

```javascript
await sql`
  SELECT dayOfWeek
  FROM tasks
  GROUP BY dayOfWeek
  HAVING mostCommon(category) = 'Cleaning'
`;
```

<!-- @include: ../.partials/functions-note.md -->
