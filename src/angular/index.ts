import { computed, effect, isSignal, signal, type Signal } from '@angular/core';
import type { SQLocal } from '../client.js';
import type { ReactiveQueryStatus, StatementInput } from '../types.js';

export function useReactiveQuery<Result extends Record<string, any>>(
	db: SQLocal | Signal<SQLocal>,
	query: StatementInput<Result> | Signal<StatementInput<Result>>
): {
	data: Signal<Result[]>;
	error: Signal<Error | undefined>;
	status: Signal<ReactiveQueryStatus>;
} {
	const data = signal<Result[]>([]);
	const error = signal<Error | undefined>(undefined);
	const pending = signal<boolean>(true);

	const dbValue = computed(() => (isSignal(db) ? db() : db));
	const queryValue = computed(() => (isSignal(query) ? query() : query));

	effect((onCleanup) => {
		const db = dbValue();
		const query = queryValue();

		const subscription = db.reactiveQuery(query).subscribe(
			(results) => {
				data.set(results);
				error.set(undefined);
				pending.set(false);
			},
			(err) => {
				error.set(err);
			}
		);

		onCleanup(() => {
			subscription.unsubscribe();
		});
	});

	const status = computed<ReactiveQueryStatus>(() => {
		const hasError = !!error();
		const isPending = pending();
		if (hasError) return 'error';
		if (isPending) return 'pending';
		return 'ok';
	});

	return {
		data: data.asReadonly(),
		error: error.asReadonly(),
		status,
	};
}
