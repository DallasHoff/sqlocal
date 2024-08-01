import { nanoid } from 'nanoid';
import type { QueryKey } from '../types.js';

export function getQueryKey(): QueryKey {
	return nanoid();
}
