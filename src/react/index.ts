import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { SQLocal } from '../client.js';
import type { StatementInput } from '../types.js';

export function useReactiveQuery<Result extends Record<string, any>>(
	db: SQLocal,
	query: StatementInput<Result>
): { data: Result[]; error: Error | undefined } {
	const [error, setError] = useState<Error | undefined>(undefined);

	const reactiveQuery = useMemo(() => {
		return db.reactiveQuery(query);
	}, [db, query]);

	const get = useCallback(() => reactiveQuery.value, [reactiveQuery]);
	const subscribe = useCallback(
		(cb: () => void) => {
			const subscription = reactiveQuery.subscribe(
				() => {
					cb();
					setError(undefined);
				},
				(err) => {
					setError(err);
				}
			);
			return () => subscription.unsubscribe();
		},
		[reactiveQuery]
	);
	const data = useSyncExternalStore(subscribe, get);

	return {
		data,
		error,
	};
}
