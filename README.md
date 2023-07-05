# SQLocal

SQLocal makes it simple to run SQLite3 in the browser, backed by the origin private file system. It wraps the [WebAssembly build of SQLite3](https://sqlite.org/wasm/doc/trunk/index.md) and gives you a simple interface to interact with databases running on device.

## Features

- 🔎 Locally executes any query that SQLite3 supports
- 🧵 Runs the SQLite engine in a web worker so queries do not block the main thread
- 📂 Persists data to the origin private file system, which is optimized for fast file I/O
- 🔒 Each user gets their own private database instance
- 🔥 Simple API; just create a database and start running SQL queries

## Example

```typescript
import { createClient } from 'sqlocal';

// Create a client with a name for the SQLite file to save in the origin private file system
const { sql } = createClient('database.sqlite3');

// Use the "sql" tagged template to execute a SQL statement against the SQLite database
await sql`CREATE TABLE groceries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`;

// Execute a prepared statement just by inserting parameters in the SQL string
const items = ['bread', 'milk', 'rice'];
for (let item of items) {
	await sql`INSERT INTO groceries (name) VALUES (${item})`;
}

// SELECT queries return the matched records as an array of objects
const groceries = await sql`SELECT * FROM groceries`;
console.log(groceries);

/* Log:
[
  { id: 1, name: 'bread' },
  { id: 2, name: 'milk' },
  { id: 3, name: 'rice' }
]
*/
```

## Install

Install the SQLocal package in your application.

```sh
npm install sqlocal
```

### Required Files

Currently, you need to copy the contents of this package's `dist/assets` directory and serve them in your application from an `assets` path at the root of your site.

A solution so that this step is not needed is being investigated.

### Cross-Origin Isolation

Since this package depends on the origin private file system API, the page you use it on must be served with the following HTTP headers. Otherwise, the browser will block access to the origin private file system.

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

If your development server uses Vite, you can do this by adding the following to your Vite configuration.

```javascript
plugins: [
	{
		name: 'configure-response-headers',
		configureServer: (server) => {
			server.middlewares.use((_req, res, next) => {
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
				next();
			});
		},
	},
],
```
