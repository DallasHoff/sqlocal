export type Sqlite3 = any;
export type Sqlite3Db = any;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type QueryKey = string;

export type WorkerConfig = {
	database?: string;
};

export type Message = QueryMessage | DataMessage | ConfigMessage | ErrorMessage;
export type QueryMessage = {
	type: 'query';
	queryKey: QueryKey;
	sql: string;
	params: any[];
	method: Sqlite3Method;
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
