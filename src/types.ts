import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';

export type Sqlite3 = Sqlite3Static;
export type Sqlite3Db = Database;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type QueryKey = string;
export type RawResultData = {
	rows: unknown[] | unknown[][];
	columns: string[];
};
export type WorkerProxy = ProxyHandler<Worker> &
	Record<string, (...args: any) => any>;

export type ProcessorConfig = {
	databasePath?: string;
};

export type Message = InputMessage | OutputMessage;
export type OmitQueryKey<T> = T extends Message ? Omit<T, 'queryKey'> : never;

export type InputMessage =
	| QueryMessage
	| BatchMessage
	| FunctionMessage
	| ConfigMessage
	| ImportMessage
	| DestroyMessage;
export type QueryMessage = {
	type: 'query';
	queryKey: QueryKey;
	sql: string;
	params: unknown[];
	method: Sqlite3Method;
};
export type BatchMessage = {
	type: 'batch';
	queryKey: QueryKey;
	statements: {
		sql: string;
		params: unknown[];
		method?: Sqlite3Method;
	}[];
};
export type FunctionMessage = {
	type: 'function';
	queryKey: QueryKey;
	functionName: string;
	functionType: UserFunction['type'];
};
export type ConfigMessage = {
	type: 'config';
	key: keyof ProcessorConfig;
	value: any;
};
export type ImportMessage = {
	type: 'import';
	queryKey: QueryKey;
	database: ArrayBuffer | Uint8Array;
};
export type DestroyMessage = {
	type: 'destroy';
	queryKey: QueryKey;
};

export type OutputMessage =
	| SuccessMessage
	| ErrorMessage
	| DataMessage
	| CallbackMessage;
export type SuccessMessage = {
	type: 'success';
	queryKey: QueryKey;
};
export type ErrorMessage = {
	type: 'error';
	queryKey: QueryKey | null;
	error: unknown;
};
export type DataMessage = {
	type: 'data';
	queryKey: QueryKey;
	data: {
		columns: string[];
		rows: unknown[] | unknown[][];
	}[];
};
export type CallbackMessage = {
	type: 'callback';
	name: string;
	args: unknown[];
};

export type UserFunction = CallbackUserFunction | ScalarUserFunction;
export type CallbackUserFunction = {
	type: 'callback';
	name: string;
	func: (...args: any[]) => void;
};
export type ScalarUserFunction = {
	type: 'scalar';
	name: string;
	func: (...args: any[]) => any;
};
