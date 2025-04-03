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
	protected dbLock?: () => void;
	protected reinitChannel?: BroadcastChannel;

	override async init(config: DriverConfig): Promise<void> {
		const { databasePath, clientKey } = config;
		const flags = this.getFlags(config);

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

		if (!('opfs' in this.sqlite3)) {
			throw new Error('OPFS not available');
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

		await this.assertDatabaseLock();

		const pool = await this.sqlite3.installOpfsSAHPoolVfs({});
		// @ts-expect-error TODO
		this.db = new pool.OpfsSAHPoolDb(databasePath, flags);
		this.config = config;
	}

	override async exec(statement: DriverStatement): Promise<RawResultData> {
		await this.assertDatabaseLock();
		return super.exec(statement);
	}

	override async execBatch(
		statements: DriverStatement[]
	): Promise<RawResultData[]> {
		await this.assertDatabaseLock();
		return super.execBatch(statements);
	}

	override async getDatabaseSizeBytes(): Promise<number> {
		await this.assertDatabaseLock();
		return super.getDatabaseSizeBytes();
	}

	override async createFunction(fn: UserFunction): Promise<void> {
		await this.assertDatabaseLock();
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
		if (!this.dbLock) return;
		// TODO: pause VFS (coming in sqlite 3.50)
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
				return new Promise<void>((release) => {
					// TODO: unpause VFS (coming in sqlite 3.50)
					lockAcquired(release);
				});
			});
		});
	}
}
