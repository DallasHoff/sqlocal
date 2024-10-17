import type { QueryKey } from '../types.js';

export function getQueryKey(): QueryKey {
	return crypto.randomUUID();
}
