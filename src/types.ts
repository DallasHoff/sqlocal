import { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';

export type Sqlite3 = Sqlite3Static;
export type Sqlite3Db = Database;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type QueryKey = string;

export type ProcessorConfig = {
	databasePath?: string;
};

export type Message = InputMessage | OutputMessage;
export type OmitQueryKey<T> = T extends Message ? Omit<T, 'queryKey'> : never;

export type InputMessage =
	| QueryMessage
	| TransactionMessage
	| FunctionMessage
	| ConfigMessage
	| ImportMessage
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
export type FunctionMessage = {
	type: 'function';
	queryKey: QueryKey;
	functionName: string;
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
	columns: string[];
	rows: any[];
};
export type CallbackMessage = {
	type: 'callback';
	name: string;
	args: any[];
};

export type UserFunction = CallbackUserFunction;
export type CallbackUserFunction = {
	type: 'callback';
	name: string;
	handler: (...args: any[]) => void;
};
