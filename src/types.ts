export type Sqlite3 = any;
export type Sqlite3Db = any;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type QueryKey = string;

export type ProcessorConfig = {
	databasePath?: string;
};

export type Message =
	| SuccessMessage
	| ErrorMessage
	| QueryMessage
	| TransactionMessage
	| CallbackMessage
	| DataMessage
	| ConfigMessage
	| FunctionMessage
	| DestroyMessage;
export type SuccessMessage = {
	type: 'success';
	queryKey: QueryKey;
};
export type ErrorMessage = {
	type: 'error';
	queryKey: QueryKey | null;
	error: unknown;
};
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
export type DataMessage = {
	type: 'data';
	queryKey: QueryKey;
	columns: string[];
	rows: any[];
};
export type ConfigMessage = {
	type: 'config';
	key: keyof ProcessorConfig;
	value: any;
};
export type FunctionMessage = {
	type: 'function';
	queryKey: QueryKey;
	functionName: string;
};
export type CallbackMessage = {
	type: 'callback';
	name: string;
	args: any[];
};
export type DestroyMessage = {
	type: 'destroy';
	queryKey: QueryKey;
};

export type OmitQueryKey<T> = T extends Message ? Omit<T, 'queryKey'> : never;

export type UserFunction = CallbackUserFunction | ScalarUserFunction;
export type CallbackUserFunction = {
	type: 'callback';
	name: string;
	handler: (...args: any[]) => void;
};
export type ScalarUserFunction = {
	type: 'scalar';
	name: string;
	handler: (...args: any[]) => any;
};
