import {
	useCallback,
	useMemo,
	useState,
	useSyncExternalStore,
	type Dispatch,
	type SetStateAction,
} from 'react';
import type { SQLocal } from '../client.js';
import type { StatementInput } from '../types.js';

export function useReactiveQuery<Result extends Record<string, any>>(
	db: SQLocal,
	query: StatementInput<Result>
): {
	data: Result[];
	error: Error | undefined;
	setDb: Dispatch<SetStateAction<SQLocal>>;
	setQuery: Dispatch<SetStateAction<StatementInput<Result>>>;
} {
	const [dbValue, setDb] = useState(() => db);
	const [queryValue, setQuery] = useState(() => query);
	const [error, setError] = useState<Error | undefined>(undefined);

	const reactiveQuery = useMemo(() => {
		return dbValue.reactiveQuery(queryValue);
	}, [dbValue, queryValue]);

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
			return () => {
				subscription.unsubscribe();
			};
		},
		[reactiveQuery]
	);
	const data = useSyncExternalStore(subscribe, get);

	return {
		data,
		error,
		setDb,
		setQuery,
	};
}
