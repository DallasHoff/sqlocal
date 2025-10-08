import {
	computed,
	isRef,
	readonly,
	shallowRef,
	watchEffect,
	type DeepReadonly,
	type Ref,
} from 'vue';
import type { SQLocal } from '../client.js';
import type { StatementInput } from '../types.js';

export function useReactiveQuery<Result extends Record<string, any>>(
	db: SQLocal | Ref<SQLocal>,
	query: StatementInput<Result> | Ref<StatementInput<Result>>
): {
	data: Readonly<Ref<DeepReadonly<Result[]>>>;
	error: Readonly<Ref<Error | undefined>>;
} {
	const data = shallowRef<Result[]>([]);
	const error = shallowRef<Error | undefined>(undefined);

	const dbValue = computed(() => (isRef(db) ? db.value : db));
	const queryValue = computed(() => (isRef(query) ? query.value : query));

	watchEffect((onCleanup) => {
		const db = dbValue.value;
		const query = queryValue.value;

		const subscription = db.reactiveQuery(query).subscribe(
			(results) => {
				data.value = results;
				error.value = undefined;
			},
			(err) => {
				error.value = err;
			}
		);

		onCleanup(() => {
			subscription.unsubscribe();
		});
	});

	return {
		data: readonly(data),
		error: readonly(error),
	};
}
