export type MutationLockOptions = {
	mode: LockMode;
	key: string;
	bypass: boolean;
};

export async function mutationLock<T>(
	options: MutationLockOptions,
	mutation: () => Promise<T>
): Promise<T> {
	if (!options.bypass && 'locks' in navigator) {
		return navigator.locks.request(
			`_sqlocal_mutation_(${options.key})`,
			{ mode: options.mode },
			mutation
		);
	} else {
		return mutation();
	}
}
