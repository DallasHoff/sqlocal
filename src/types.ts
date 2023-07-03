export type Sqlite3 = any;
export type Sqlite3Db = any;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type QueryKey = string;

export type WorkerConfig = {
	database?: string;
};

export type QueryMessage = {
	type: 'query';
	database: string;
	key: QueryKey;
	sql: string;
	params: any[];
	method: Sqlite3Method;
};
export type DataMessage = {
	type: 'data';
	key: QueryKey;
	rows: any[];
	columns: string[];
};
export type ConfigMessage = {
	type: 'config';
	key: keyof WorkerConfig;
	value: any;
};
export type ErrorMessage = {
	type: 'error';
	key: QueryKey | null;
	error: unknown;
};
export type Message = QueryMessage | DataMessage | ConfigMessage | ErrorMessage;
