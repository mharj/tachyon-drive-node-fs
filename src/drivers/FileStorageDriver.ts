import {existsSync, Stats, unwatchFile, watchFile} from 'fs';
import {ILoggerLike, IPersistSerializer, IStoreProcessor, StorageDriver} from 'tachyon-drive';
import {readFile, unlink, writeFile} from 'fs/promises';

type EventualFileName = string | Promise<string> | (() => string | Promise<string>);

export class FileStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private isWriting = false;
	private fileNameOrPromise: EventualFileName;
	private fileWatch = false;

	/**
	 * FileStorageDriver
	 * @param name - name of the driver
	 * @param fileName - file name or async function that returns a file name
	 * @param serializer - serializer to serialize and deserialize data (to and from Buffer)
	 * @param processor - optional processor to process data before storing and after hydrating
	 * @param logger - optional logger to log messages
	 */
	constructor(
		name: string,
		fileName: EventualFileName,
		serializer: IPersistSerializer<Input, Buffer>,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, processor, logger);
		this.fileNameOrPromise = fileName;
	}

	/**
	 * initialize watcher if have a file
	 */
	protected handleInit(): Promise<boolean> {
		this.setFileWatcher();
		return Promise.resolve(true);
	}

	/**
	 * Actual implementation of store data to the file
	 */
	protected async handleStore(buffer: Buffer): Promise<void> {
		// buffer sainity check
		if (!Buffer.isBuffer(buffer)) {
			throw new TypeError(`FileStorageDriver '${this.name}' can only store Buffers`);
		}
		this.isWriting = true;
		await writeFile(await this.getFileName(), buffer);
		this.setFileWatcher();
		this.isWriting = false;
	}

	/**
	 * Actual implementation of hydrate data from the file
	 */
	protected async handleHydrate(): Promise<Buffer | undefined> {
		const fileName = await this.getFileName();
		if (existsSync(fileName)) {
			const buffer = await readFile(fileName);
			this.setFileWatcher();
			return buffer;
		}
		return undefined;
	}

	/**
	 * Actual implementation of delete file and unwatch it
	 */
	protected async handleClear(): Promise<void> {
		const fileName = await this.getFileName();
		if (this.fileWatch) {
			unwatchFile(fileName, this.fileWatcher);
			this.fileWatch = false;
		}
		if (existsSync(fileName)) {
			this.isWriting = true;
			await unlink(fileName);
			this.isWriting = false;
		}
		await this.handleUpdate(); // emit change
	}

	/**
	 * Set file watcher if file exists
	 */
	private async setFileWatcher() {
		const fileName = await this.getFileName();
		if (!this.fileWatch && existsSync(fileName)) {
			watchFile(fileName, this.fileWatcher);
			this.fileWatch = true;
		}
	}

	/**
	 * method for file watcher instance
	 */
	private async fileWatcher(_curr: Stats, _prev: Stats) {
		if (!this.isWriting) {
			await this.handleUpdate();
		}
	}

	/**
	 * Build file name from fileNameOrPromise
	 */
	private async getFileName(): Promise<string> {
		const value = await (typeof this.fileNameOrPromise === 'function' ? this.fileNameOrPromise() : this.fileNameOrPromise);
		if (typeof value !== 'string') {
			throw new TypeError(`FileStorageDriver '${this.name}' fileName argument must return a string, value: ${JSON.stringify(value)}`);
		}
		return value;
	}
}
