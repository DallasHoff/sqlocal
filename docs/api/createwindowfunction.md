# createWindowFunction

Create a SQL function that can be called from queries to perform calculations for rows using data from related rows.

## Usage

Access or destructure `createWindowFunction` from the `SQLocal` client.

```javascript
import { SQLocal } from 'sqlocal';

const { createWindowFunction } = new SQLocal('database.sqlite3');
```

<!-- @include: ../.partials/initialization-note.md -->

This method takes a string to name a custom SQL function as its first argument and an object containing four callbacks (`step`, `inverse`, `value`, and `final`) as its second argument. After running `createWindowFunction`, the function that you defined can be called from subsequent SQL queries as a window aggregate function with an `OVER` clause or as a regular aggregate function if no `OVER` clause is used. Window aggregate functions will return a value for each row in the result set, and they can access values from other rows to calculate that value.

<!-- prettier-ignore -->
| Callback  | Description |
| --------- | ----------- |
| `step`    | Used by both window aggregate and regular aggregate function implementations. It is invoked to add a row to the current window. The function arguments, if any, corresponding to the row being added are passed to the implementation of `step`. |
| `final`   | Used by both window aggregate and regular aggregate function implementations. It is invoked to return the current value of the aggregate (determined by the contents of the current window), and to free any resources allocated by earlier calls to `step`. |
| `value`   | Only used for window aggregate functions. The presence of this method is what distinguishes a window aggregate function from a regular aggregate function. This method is invoked to return the current value of the aggregate. Unlike `final`, the implementation should not delete any context. |
| `inverse` | Only used for window aggregate functions. It is invoked to remove the oldest presently aggregated result of `step` from the current window. The function arguments, if any, are those passed to `step` for the row being removed. |

For example, the below window function will use the preceding, current, and next rows in the result set, calculate the difference between the highest and lowest values of the three, and return that difference in the current result row.

```javascript
let values = [];

const calcRange = (isFinal) => {
	if (values.length === 0) return null;
	const min = values[0];
	const max = values[values.length - 1];
	if (isFinal) values = [];
	return max - min;
};

await createWindowFunction('range', {
	step: (value) => {
		if (typeof value !== 'number') return;
		const idx = values.findIndex((v) => v > value);
		if (idx === -1) {
			values.push(value);
		} else {
			values.splice(idx, 0, value);
		}
	},
	inverse: (value) => {
		if (typeof value !== 'number') return;
		const idx = values.indexOf(value);
		if (idx !== -1) values.splice(idx, 1);
	},
	value: () => calcRange(false),
	final: () => calcRange(true),
});

await sql`
  SELECT
    value,
    range(value) OVER (
      ORDER BY sampleIndex
      ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
    ) AS rangeOver3
  FROM tracking
`;
```

The same function can also be used as a regular aggregate function if called without an `OVER` clause. In this case, only 1 result row will be returned from the query, and it will contain the range over all rows that the query matched.

```javascript
await sql`SELECT range(value) AS range FROM tracking`;
```

To define SQL functions that only need to work as regular aggregate functions, use [`createAggregateFunction`](./createaggregatefunction.md).

<!-- @include: ../.partials/functions-note.md -->
