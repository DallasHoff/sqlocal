import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { CompiledQuery as KyselyQuery } from 'kysely';
import type { RunnableQuery as DrizzleQuery } from 'drizzle-orm/runnable-query';
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy';
import type { sqlTag } from './lib/sql-tag.js';

// SQLite

export type Sqlite3 = Sqlite3Static;
export type Sqlite3Db = Database;
export type Sqlite3Method = 'get' | 'all' | 'run' | 'values';
export type Sqlite3StorageType = 'memory' | 'opfs';

// Queries

export type Statement = {
	sql: string;
	params: unknown[];
};

export type ReturningStatement<Result = unknown> =
	| Statement
	| KyselyQuery<Result>
	| DrizzleQuery<
			Result extends SqliteRemoteResult<unknown> ? any : Result[],
			'sqlite'
	  >;

export type StatementInput<Result = unknown> =
	| ReturningStatement<Result>
	| ((sql: typeof sqlTag) => ReturningStatement<Result>);

export type Transaction = {
	query: <Result extends Record<string, any>>(
		passStatement: StatementInput<Result>
	) => Promise<Result[]>;
	sql: <Result extends Record<string, any>>(
		queryTemplate: TemplateStringsArray | string,
		...params: unknown[]
	) => Promise<Result[]>;
	commit: () => Promise<void>;
	rollback: () => Promise<void>;
};

export type RawResultData = {
	rows: unknown[] | unknown[][];
	columns: string[];
};

// Database status

export type DatabasePath = (string & {}) | ':memory:';

export type ClientConfig = {
	databasePath: DatabasePath;
	readOnly?: boolean;
	verbose?: boolean;
	onInit?: (sql: typeof sqlTag) => void | Statement[];
	onConnect?: (reason: ConnectReason) => void;
};

export type ProcessorConfig = {
	databasePath?: DatabasePath;
	readOnly?: boolean;
	verbose?: boolean;
	clientKey?: QueryKey;
	onInitStatements?: Statement[];
};

export type DatabaseInfo = {
	databasePath?: DatabasePath;
	databaseSizeBytes?: number;
	storageType?: Sqlite3StorageType;
	persisted?: boolean;
};

// Worker messages

export type Message = InputMessage | OutputMessage;
export type QueryKey = string;
export type OmitQueryKey<T> = T extends Message ? Omit<T, 'queryKey'> : never;
export type WorkerProxy = (typeof globalThis | ProxyHandler<Worker>) &
	Record<string, (...args: any) => any>;
export type ConnectReason = 'initial' | 'overwrite' | 'delete';

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
	buffer: Uint8Array;
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

export type ReinitMessage = {
	clientKey: QueryKey;
	reason: ConnectReason;
};

// User functions

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
