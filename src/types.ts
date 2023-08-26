export type Sqlite3 = any;
export type Sqlite3Db = any;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type QueryKey = string;

export type WorkerConfig = {
	databasePath?: string;
};

export type Message =
	| QueryMessage
	| TransactionMessage
	| CallbackMessage
	| DataMessage
	| ConfigMessage
	| ErrorMessage
	| DestroyMessage;
export type QueryMessage = {
	type: 'query';
	queryKey: QueryKey;
	sql: string;
	params: any[];
	method: Sqlite3Method;
};
export type TransactionMessage = {
	type: 'transaction';
	queryKey: QueryKey;
	statements: {
		sql: string;
		params: any[];
	}[];
};
export type CallbackMessage = {
	type: 'callback';
	name: string;
	args?: any[];
};
export type DataMessage = {
	type: 'data';
	queryKey: QueryKey;
	columns: string[];
	rows: any[];
};
export type ConfigMessage = {
	type: 'config';
	key: keyof WorkerConfig;
	value: any;
};
export type ErrorMessage = {
	type: 'error';
	queryKey: QueryKey | null;
	error: unknown;
};
export type DestroyMessage = {
	type: 'destroy';
	queryKey: QueryKey;
};

export type OmitQueryKey<T> = T extends Message ? Omit<T, 'queryKey'> : never;
