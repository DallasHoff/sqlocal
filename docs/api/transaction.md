# transaction

Execute SQL transactions against the database.

## Usage

Access or destructure `transaction` from the `SQLocal` client.

```javascript
import { SQLocal } from 'sqlocal';

export const { transaction } = new SQLocal('database.sqlite3');
```

<!-- @include: ../_partials/initialization-note.md -->

Provide a function to `transaction` that returns an array of SQL queries constructed using the `sql` tagged template function passed to it.

```javascript
const senderId = 1;
const receiverId = 2;
const coins = 4856;

await transaction((sql) => [
	sql`INSERT INTO transfer (sender, receiver, coins) VALUES (${senderId}, ${receiverId}, ${coins})`,
	sql`UPDATE player SET coins = coins - ${coins} WHERE id = ${senderId}`,
	sql`UPDATE player SET coins = coins + ${coins} WHERE id = ${receiverId}`,
]);
```

This `sql` tag function works similarly to the [`sql` tag function used for single queries](sql.md), but the queries passed to `transaction` should not be individually `await`ed. Await the call to `transaction`, and each query will be executed against the database in order.

If any of the queries fail, `transaction` will throw an error and the transaction will be rolled back automatically. If all queries succeed, the transaction will be committed.
