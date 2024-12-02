# deleteDatabaseFile

Delete the SQLite database file.

## Usage

Access or destructure `deleteDatabaseFile` from the `SQLocal` client.

```javascript
import { SQLocal } from 'sqlocal';

const { deleteDatabaseFile } = new SQLocal('database.sqlite3');
```

<!-- @include: ../_partials/initialization-note.md -->

The `deleteDatabaseFile` method returns a `Promise` to delete the `SQLocal` instance's associated database file and [temporary files](https://www.sqlite.org/tempfiles.html). After this method completes, the `SQLocal` client will reinitialize, and any subsequent mutation queries will create a new database file.

```javascript
await deleteDatabaseFile();
```

The method also accepts an optional argument: a callback function to run after the database is deleted but before connections from other SQLocal client instances are allowed to access the new database, a good time to run migrations.

```javascript
await deleteDatabaseFile(async () => {
	// Run your migrations
});
```

Since calling `deleteDatabaseFile` will reset all connections to the database file, the configured `onInit` statements and `onConnect` hook (see [Options](../guide/setup.md#options)) will re-run on any SQLocal clients connected to the database when it is cleared. The client that initiated the deletion will have its `onConnect` hook run first, before the method's callback, and the other clients' `onConnect` hooks will run after the callback.
