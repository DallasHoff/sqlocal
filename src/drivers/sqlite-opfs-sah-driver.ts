import type { SAHPoolUtil } from '@sqlite.org/sqlite-wasm';
import { parseDatabasePath } from '../lib/parse-database-path.js';
import type { BroadcastMessage, LockBroadcast } from '../messages.js';
import type {
	DriverConfig,
	DriverStatement,
	RawResultData,
	SQLocalDriver,
	UserFunction,
} from '../types.js';
import { SQLiteOpfsDriver } from './sqlite-opfs-driver.js';

export class SQLiteOpfsSahDriver
	extends SQLiteOpfsDriver
	implements SQLocalDriver
{
	protected pool?: SAHPoolUtil;
	protected dbLock?: () => void;
	protected reinitChannel?: BroadcastChannel;

	override async init(config: DriverConfig): Promise<void> {
		const { databasePath, clientKey } = config;
		if (!databasePath || !clientKey) {
			throw new Error('No databasePath specified');
		}

		if (!this.sqlite3InitModule) {
			const { default: sqlite3InitModule } = await import(
				'@sqlite.org/sqlite-wasm'
			);
			this.sqlite3InitModule = sqlite3InitModule;
		}

		if (!this.sqlite3) {
			this.sqlite3 = await this.sqlite3InitModule();
		}

		if (this.db) {
			await this.destroy();
		}

		this.reinitChannel = new BroadcastChannel(
			`_sqlocal_reinit_(${databasePath})`
		);

		this.reinitChannel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
			const message = event.data;

			if (clientKey !== message.clientKey && message.type === 'lock') {
				this.releaseDatabaseLock();
			}
		};

		this.config = config;

		await this.assertDatabaseLock();
		await this.initDb();
	}

	protected async initDb(): Promise<void> {
		if (this.db) {
			return;
		}
		if (!this.config?.databasePath || !this.sqlite3) {
			throw new Error('Driver not initialized');
		}

		if (!this.pool) {
			this.pool = await this.sqlite3.installOpfsSAHPoolVfs({});
		}

		this.db = new this.pool.OpfsSAHPoolDb(
			this.config.databasePath,
			// @ts-expect-error TODO
			this.getFlags(this.config)
		);
	}

	override async exec(statement: DriverStatement): Promise<RawResultData> {
		await this.assertDatabaseLock();
		await this.initDb();
		return super.exec(statement);
	}

	override async execBatch(
		statements: DriverStatement[]
	): Promise<RawResultData[]> {
		await this.assertDatabaseLock();
		await this.initDb();
		return super.execBatch(statements);
	}

	override async getDatabaseSizeBytes(): Promise<number> {
		await this.assertDatabaseLock();
		await this.initDb();
		return super.getDatabaseSizeBytes();
	}

	override async createFunction(fn: UserFunction): Promise<void> {
		await this.assertDatabaseLock();
		await this.initDb();
		return super.createFunction(fn);
	}

	override async destroy(): Promise<void> {
		this.closeDb();
		this.releaseDatabaseLock();
		this.closeReinitChannel();
	}

	protected closeReinitChannel(): void {
		if (!this.reinitChannel) return;
		this.reinitChannel.close();
		this.reinitChannel = undefined;
	}

	protected async assertDatabaseLock(): Promise<void> {
		if (this.dbLock) return;
		this.dbLock = await this.acquireDatabaseLock();
	}

	protected releaseDatabaseLock(): void {
		if (!this.dbLock || !this.pool) return;
		this.closeDb();
		// @ts-expect-error TODO
		this.pool.pauseVfs();
		this.dbLock();
		this.dbLock = undefined;
	}

	protected async acquireDatabaseLock(): Promise<() => void> {
		if (
			!('locks' in navigator) ||
			!this.config?.databasePath ||
			!this.config.clientKey ||
			!this.reinitChannel
		) {
			throw new Error('Driver not initialized');
		}

		const lockKey = `_sqlocal_sah_(${this.config.databasePath})`;
		const lockOptions = { mode: 'exclusive' } satisfies LockOptions;

		this.reinitChannel.postMessage({
			type: 'lock',
			clientKey: this.config.clientKey,
		} satisfies LockBroadcast);

		return new Promise<() => void>((lockAcquired) => {
			navigator.locks.request(lockKey, lockOptions, () => {
				return new Promise<void>(async (release) => {
					// @ts-expect-error TODO
					await this.pool?.unpauseVfs();
					lockAcquired(release);
				});
			});
		});
	}

	override async import(
		database: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>
	): Promise<void> {
		if (!this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}

		const data =
			database instanceof ReadableStream
				? await new Response(database).arrayBuffer()
				: database;

		await this.pool?.importDb(this.config.databasePath, data);
	}

	override async export(): Promise<{
		name: string;
		data: ArrayBuffer | Uint8Array;
	}> {
		if (!this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}

		let name, data;
		const path = parseDatabasePath(this.config.databasePath);

		name = path.fileName;
		data =
			(await this.pool?.exportFile(this.config?.databasePath))?.buffer ||
			new ArrayBuffer(0);

		return {
			name,
			data,
		};
	}

	override async clear(): Promise<void> {
		if (!this.config?.databasePath) {
			throw new Error('Driver not initialized');
		}
		await this.destroy();
		await this.pool?.removeVfs();
	}
}
