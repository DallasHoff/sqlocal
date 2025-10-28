# reactiveQuery

Subscribe to a SQL query and receive the latest results whenever the read tables change.

## Usage

Access or destructure `reactiveQuery` from the `SQLocal` client. To enable this feature, the `reactive` option must be set to `true`.

```javascript
import { SQLocal } from 'sqlocal';

const { reactiveQuery } = new SQLocal({
	databasePath: 'database.sqlite3',
	reactive: true,
});
```

<!-- @include: ../.partials/initialization-note.md -->

The `reactiveQuery` method takes a SQL query and allows you to subscribe to its results. When you call the `subscribe` method it returns, the query will run and its result data will be passed to your callback, and any time the database tables that are read from in that query get updated, the query will automatically re-run and pass the latest results to the callback.

The query can automatically react to mutations made on the database by the same _or_ other `SQLocal` instances that have the `reactive` option set to `true`, even if they are done in other windows/tabs of the web app. Inserts, updates, or deletes to the relevent database tables from any scope will trigger the subscription.

```javascript
const subscription = reactiveQuery(
	(sql) => sql`SELECT name FROM groceries`
).subscribe((data) => {
	console.log('Grocery List Updated:', data);
});
```

The query can be any SQL statement that reads one or more tables. It can be passed using a `sql` tag function available in the `reactiveQuery` callback that works similarly to the [`sql` tag function used for single queries](sql.md). It can also be a query built with Drizzle or Kysely; see the "Query Builders" section [below](#query-builders).

You can then call `subscribe` on the object returned from `reactiveQuery` to register a callback that gets called an initial time and then again whenever the one or more of the queried tables are changed. The latest result data from the query will be passed as the first argument to your callback.

You can also pass a second callback to `subscribe` that will be called if there are any errors when running your query.

```javascript
const groceries = reactiveQuery((sql) => sql`SELECT name FROM groceries`);

const subscription = groceries.subscribe(
	(data) => {
		console.log('Grocery List Updated:', data);
	},
	(err) => {
		console.error('Query Error:', err);
	}
);
```

To stop receiving updates and clean up the subscription, call `unsubscribe` on the object returned from `subscribe`.

```javascript
subscription.unsubscribe();
```

Note that mutations that happen inside a [transaction](transaction.md) will not trigger reactive queries until the transaction is committed. This ensures your data does not get out of sync in the case that the transaction is rolled back. Also, because of [SQLite's "Truncate Optimization"](https://sqlite.org/lang_delete.html#truncateopt), reactive queries will not be triggered by DELETE statements that have no WHERE clause, RETURNING clause, or table triggers.

## Query Builders

If you are using a query builder, you can use it to create the reactive query, rather than use the `sql` tag function. The data emitted in the `subscribe` callback will then be fully typed by the query builder.

### Drizzle

With Drizzle ORM, construct a query and pass it to `reactiveQuery` without executing it.

```javascript
const subscription = reactiveQuery(
	db.select({ name: groceries.name }).from(groceries)
).subscribe((data) => {
	// data is typed as { name: string; }[]
	console.log('Grocery List Updated:', data);
});
```

### Kysely

With Kysely, construct a query, call the `compile` method on it, and pass it to `reactiveQuery`.

```javascript
const subscription = reactiveQuery(
	db.selectFrom('groceries').select('name').compile()
).subscribe((data) => {
	// data is typed as { name: string; }[]
	console.log('Grocery List Updated:', data);
});
```

## UI Frameworks

We also provide `useReactiveQuery` hook implementations to make it easier to integrate reactive queries with the reactivity systems of UI frameworks. The hook handles subscribing, returns reactive data, and automatically unsubscribes from the query when the component it's used in is destroyed.

`useReactiveQuery` takes your `SQLocal` instance and a SQL query as arguments. The query can be passed using the `sql` tag function or using a query builder as described [above](#query-builders). It returns an object containing the following reactive values:

- **`data`** (`Result[]`) - The result data from your SQL query.
- **`error`** (`Error | undefined`) - An `Error` object if the SQL query fails.
- **`status`** (`'pending' | 'error' | 'ok'`) - The string `'pending'` if the SQL query has not completed for the first time yet, `'error'` if the SQL query failed, or `'ok'` if the SQL query returned successfully.

### React

Import the React version of `useReactiveQuery` from `sqlocal/react`. It requires React 18 or higher.

In addition to `data`, `error`, and `status`, the object returned from this version of `useReactiveQuery` also contains `setDb` and `setQuery` functions which allow you to dynamically change the arguments from their initial values and automatically resubscribe.

```js
import { SQLocal } from 'sqlocal';
import { useReactiveQuery } from 'sqlocal/react';

const db = new SQLocal({
	databasePath: 'database.sqlite3',
	reactive: true,
});

export function MyComponent() {
	const groceries = useReactiveQuery(db, (sql) => sql`SELECT * FROM groceries`);
}
```

### Vue

Import the Vue version of `useReactiveQuery` from `sqlocal/vue`. It requires Vue 3 or higher.

This version of `useReactiveQuery` returns `data`, `error`, and `status` as read-only Vue refs. It can also accept its arguments as refs, which allows you to dynamically change them from their initial values and automatically resubscribe.

```vue
<script setup>
import { SQLocal } from 'sqlocal';
import { useReactiveQuery } from 'sqlocal/vue';

const db = new SQLocal({
	databasePath: 'database.sqlite3',
	reactive: true,
});
const groceries = useReactiveQuery(db, (sql) => sql`SELECT * FROM groceries`);
</script>
```

### Angular

Import the Angular version of `useReactiveQuery` from `sqlocal/angular`. It requires Angular 17 or higher.

This version of `useReactiveQuery` returns `data`, `error`, and `status` as read-only Angular signals. It can also accept its arguments as signals, which allows you to dynamically change them from their initial values and automatically resubscribe.

```ts
import { Component } from '@angular/core';
import { SQLocal } from 'sqlocal';
import { useReactiveQuery } from 'sqlocal/angular';

const db = new SQLocal({
	databasePath: 'database.sqlite3',
	reactive: true,
});

@Component({
	selector: 'my-component',
})
export class MyComponent {
	groceries = useReactiveQuery(db, (sql) => sql`SELECT * FROM groceries`);
}
```
