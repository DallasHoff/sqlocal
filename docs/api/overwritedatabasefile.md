# overwriteDatabaseFile

Replace the contents of the SQLite database file.

## Usage

Access or destructure `overwriteDatabaseFile` from the `SQLocal` client.

```javascript
import { SQLocal } from 'sqlocal';

const { overwriteDatabaseFile } = new SQLocal('database.sqlite3');
```

<!-- @include: ../_partials/initialization-note.md -->

The `overwriteDatabaseFile` method takes a database file as a [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File), [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob), [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream), [`ArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer), or [`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) object and returns a `Promise` to replace the `SQLocal` instance's associated database file with the one provided.

For example, you can download a database file from your server to replace the local file.

```javascript
const response = await fetch('https://example.com/download?id=12345');
const databaseFile = await response.blob();
await overwriteDatabaseFile(databaseFile);
```

If the database file might be large, you could alternatively pass the `ReadableStream` from the response's `body`, and SQLocal will stream the database to the client in chunks.

```javascript
const response = await fetch('https://example.com/download?id=12345');
const databaseStream = response.body;
if (databaseStream === null) throw new Error('No database found');
await overwriteDatabaseFile(databaseStream);
```

Or, your app may allow the user to import a database file through a form.

```javascript
const fileInput = document.querySelector('input[type="file"]');
const databaseFile = fileInput.files[0];
await overwriteDatabaseFile(databaseFile);
```

The method also accepts a second, optional argument: a callback function to run after the overwrite but before connections from other SQLocal client instances are allowed to access the new database, a good time to run migrations.

```javascript
await overwriteDatabaseFile(databaseFile, async () => {
	// Run your migrations
});
```

Since calling `overwriteDatabaseFile` will reset all connections to the database file, the configured `onInit` statements and `onConnect` hook (see [Options](../guide/setup.md#options)) will re-run on any SQLocal clients connected to the database when it is overwritten. The client that initiated the overwrite will have its `onConnect` hook run first, before the method's callback, and the other clients' `onConnect` hooks will run after the callback.
