import {
	useCallback,
	useMemo,
	useState,
	useSyncExternalStore,
	type Dispatch,
	type SetStateAction,
} from 'react';
import type { SQLocal } from '../client.js';
import type { ReactiveQueryStatus, StatementInput } from '../types.js';

export function useReactiveQuery<Result extends Record<string, any>>(
	db: SQLocal,
	query: StatementInput<Result>
): {
	data: Result[];
	error: Error | undefined;
	status: ReactiveQueryStatus;
	setDb: Dispatch<SetStateAction<SQLocal>>;
	setQuery: Dispatch<SetStateAction<StatementInput<Result>>>;
} {
	const [dbValue, setDb] = useState(() => db);
	const [queryValue, setQuery] = useState(() => query);
	const [error, setError] = useState<Error | undefined>(undefined);
	const [pending, setPending] = useState<boolean>(true);

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
					setPending(false);
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
	const status = !!error ? 'error' : pending ? 'pending' : 'ok';

	return {
		data,
		error,
		status,
		setDb,
		setQuery,
	};
}
