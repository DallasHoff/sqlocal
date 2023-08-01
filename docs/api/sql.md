# sql

Execute SQL queries against the database.

## Usage

Access or destructure `sql` from the `SQLocal` client.

```javascript
import { SQLocal } from 'sqlocal';

export const { sql } = new SQLocal('database.sqlite3');
```

<!-- @include: ../_partials/initialization-note.md -->

`sql` is used as a [tagged template](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates). Values interpolated into the query string will be passed to the database as parameters to that query.

```javascript
const item = 'Bread';
const quantity = 2;
await sql`INSERT INTO groceries (name, quantity) VALUES (${item}, ${quantity})`;
```

SELECT queries and queries with the RETURNING clause will return the matched records as an array of objects.

```javascript
const data = await sql`SELECT * FROM groceries`;
console.log(data);
```

Example result:

```javascript
[
	{ id: 1, name: 'Rice', quantity: 4 },
	{ id: 2, name: 'Milk', quantity: 1 },
	{ id: 3, name: 'Bread', quantity: 2 },
];
```
