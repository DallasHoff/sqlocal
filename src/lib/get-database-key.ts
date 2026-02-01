import type { DatabasePath } from '../types.js';
import { getQueryKey } from './get-query-key.js';

export function getDatabaseKey(
	databasePath: DatabasePath,
	clientKey: string
): string {
	switch (databasePath) {
		case 'session':
		case ':sessionStorage:':
			// The sessionStorage DB can be shared between clients in the same tab
			let sessionKey = sessionStorage._sqlocal_session_key;

			if (!sessionKey) {
				sessionKey = getQueryKey();
				sessionStorage._sqlocal_session_key = sessionKey;
			}

			return `session:${sessionKey}`;

		case 'local':
		case ':localStorage:':
			// There's only one localStorage DB per origin
			return 'local';

		case ':memory:':
			// Each memory DB is unique to a client
			return `memory:${clientKey}`;

		default:
			// OPFS DBs are shared by path across same-origin tabs
			return `path:${databasePath}`;
	}
}
