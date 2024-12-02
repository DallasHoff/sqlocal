import type { ClientConfig } from '../types.js';

export async function mutationLock<T>(
	mode: LockMode,
	bypass: boolean,
	config: ClientConfig,
	mutation: () => Promise<T>
): Promise<T> {
	if (!bypass && 'locks' in navigator) {
		return navigator.locks.request(
			`_sqlocal_mutation_(${config.databasePath})`,
			{ mode },
			mutation
		);
	} else {
		return mutation();
	}
}
