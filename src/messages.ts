import type {
	ConnectReason,
	DatabaseInfo,
	ProcessorConfig,
	QueryKey,
	Sqlite3Method,
	UserFunction,
} from './types.js';

export type Message = InputMessage | OutputMessage;
export type OmitQueryKey<T> = T extends Message ? Omit<T, 'queryKey'> : never;
export type WorkerProxy = (typeof globalThis | ProxyHandler<Worker>) &
	Record<string, (...args: any) => any>;

// Input messages

export type InputMessage =
	| QueryMessage
	| BatchMessage
	| TransactionMessage
	| FunctionMessage
	| ConfigMessage
	| GetInfoMessage
	| ImportMessage
	| ExportMessage
	| DeleteMessage
	| DestroyMessage;
export type QueryMessage = {
	type: 'query';
	queryKey: QueryKey;
	transactionKey?: QueryKey;
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
export type TransactionMessage = {
	type: 'transaction';
	queryKey: QueryKey;
	transactionKey: QueryKey;
	action: 'begin' | 'rollback' | 'commit';
};
export type FunctionMessage = {
	type: 'function';
	queryKey: QueryKey;
	functionName: string;
	functionType: UserFunction['type'];
};
export type ConfigMessage = {
	type: 'config';
	config: ProcessorConfig;
};
export type GetInfoMessage = {
	type: 'getinfo';
	queryKey: QueryKey;
};
export type ImportMessage = {
	type: 'import';
	queryKey: QueryKey;
	database: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>;
};
export type ExportMessage = {
	type: 'export';
	queryKey: QueryKey;
};
export type DeleteMessage = {
	type: 'delete';
	queryKey: QueryKey;
};
export type DestroyMessage = {
	type: 'destroy';
	queryKey: QueryKey;
};

// Output messages

export type OutputMessage =
	| SuccessMessage
	| ErrorMessage
	| DataMessage
	| BufferMessage
	| CallbackMessage
	| InfoMessage
	| EventMessage;
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
export type BufferMessage = {
	type: 'buffer';
	queryKey: QueryKey;
	bufferName: string;
	buffer: ArrayBuffer | Uint8Array;
};
export type CallbackMessage = {
	type: 'callback';
	name: string;
	args: unknown[];
};
export type InfoMessage = {
	type: 'info';
	queryKey: QueryKey;
	info: DatabaseInfo;
};
export type EventMessage = {
	type: 'event';
	event: 'connect';
	reason: ConnectReason;
};

// Broadcast messages

export type BroadcastMessage = ReinitBroadcast | CloseBroadcast;
export type ReinitBroadcast = {
	type: 'reinit';
	clientKey: QueryKey;
	reason: ConnectReason;
};
export type CloseBroadcast = {
	type: 'close';
	clientKey: QueryKey;
};
