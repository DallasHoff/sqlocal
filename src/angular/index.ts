import { computed, effect, isSignal, signal, type Signal } from '@angular/core';
import type { SQLocal } from '../client.js';
import type { StatementInput } from '../types.js';

export function useReactiveQuery<Result extends Record<string, any>>(
	db: SQLocal | Signal<SQLocal>,
	query: StatementInput<Result> | Signal<StatementInput<Result>>
): { data: Signal<Result[]>; error: Signal<Error | undefined> } {
	const data = signal<Result[]>([]);
	const error = signal<Error | undefined>(undefined);

	const dbValue = computed(() => (isSignal(db) ? db() : db));
	const queryValue = computed(() => (isSignal(query) ? query() : query));

	effect((onCleanup) => {
		const db = dbValue();
		const query = queryValue();

		const subscription = db.reactiveQuery(query).subscribe(
			(results) => {
				data.set(results);
				error.set(undefined);
			},
			(err) => {
				error.set(err);
			}
		);

		onCleanup(() => {
			subscription.unsubscribe();
		});
	});

	return {
		data: data.asReadonly(),
		error: error.asReadonly(),
	};
}
