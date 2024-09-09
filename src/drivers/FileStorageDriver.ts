import {existsSync, type FSWatcher, watch} from 'node:fs';
import {type IPersistSerializer, type IStoreProcessor, StorageDriver, TachyonBandwidth} from 'tachyon-drive';
import {type Loadable, toError} from '@luolapeikko/ts-common';
import {readFile, unlink, writeFile} from 'fs/promises';
import type {ILoggerLike} from '@avanio/logger-like';

export type FileStorageDriverOptions = {
	/**
	 * File name or async function that returns a file name
	 */
	fileName: Loadable<string>;
	/**
	 * Speed of the file storage driver, default is "TachyonBandwidth.Large".
	 */
	bandwidth?: TachyonBandwidth;
};

/**
 * A storage driver that uses the local file system to store files.
 */
export class FileStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	public readonly bandwidth: TachyonBandwidth;
	private isWriting = false;
	private fileName: Loadable<string>;
	private fileWatch: FSWatcher | undefined;

	private fileChangeTimeout: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Creates a new instance of the `FileStorageDriver` class.
	 * @param name - name of the driver
	 * @param options - options for the driver
	 * @param options.fileName - file name or async function that returns a file name
	 * @param options.bandwidth - speed of the file storage driver, default is "TachyonBandwidth.Large"
	 * @param serializer - serializer to serialize and deserialize data (to and from Buffer)
	 * @param processor - optional processor to process data before storing and after hydrating
	 * @param logger - optional logger to log messages
	 */
	constructor(
		name: string,
		options: FileStorageDriverOptions,
		serializer: IPersistSerializer<Input, Buffer>,
		processor?: Loadable<IStoreProcessor<Buffer>>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, null, processor, logger);
		this.bandwidth = options.bandwidth || TachyonBandwidth.Large;
		this.fileName = options.fileName;
		this.fileWatcher = this.fileWatcher.bind(this);
	}

	/**
	 * initialize watcher if have a file
	 */
	protected async handleInit(): Promise<boolean> {
		await this.setFileWatcher();
		return true;
	}

	/**
	 * unload watcher if have a file
	 */
	protected async handleUnload(): Promise<boolean> {
		return this.unsetFileWatcher();
	}

	/**
	 * Actual implementation of store data to the file
	 */
	protected async handleStore(buffer: Buffer): Promise<void> {
		// buffer sanity check
		if (!Buffer.isBuffer(buffer)) {
			throw new TypeError(`FileStorageDriver '${this.name}' can only store Buffers`);
		}
		this.isWriting = true;
		await writeFile(await this.getFileName(), buffer);
		await this.setFileWatcher();
		this.isWriting = false;
	}

	/**
	 * Actual implementation of hydrate data from the file
	 */
	protected async handleHydrate(): Promise<Buffer | undefined> {
		const fileName = await this.getFileName();
		if (existsSync(fileName)) {
			const buffer = await readFile(fileName);
			await this.setFileWatcher();
			return buffer;
		}
		return undefined;
	}

	/**
	 * Actual implementation of delete file and unwatch it
	 */
	protected async handleClear(): Promise<void> {
		await this.unsetFileWatcher();
		const fileName = await this.getFileName();
		if (existsSync(fileName)) {
			this.isWriting = true;
			await unlink(fileName);
			this.isWriting = false;
		}
	}

	/**
	 * Set file watcher if file exists
	 */
	private async setFileWatcher() {
		const fileName = await this.getFileName();
		if (!this.fileWatch && existsSync(fileName)) {
			this.fileWatch = watch(fileName, this.fileWatcher);
		}
	}

	private unsetFileWatcher(): Promise<boolean> {
		if (this.fileWatch) {
			this.fileWatch.close();
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
	}

	/**
	 * method for file watcher instance
	 */
	private fileWatcher(event: 'rename' | 'change') {
		// ignore watcher events if writing
		if (!this.isWriting && event === 'change') {
			if (this.fileChangeTimeout) {
				clearTimeout(this.fileChangeTimeout);
			}
			// delay to avoid multiple file change events
			this.fileChangeTimeout = setTimeout(async () => {
				this.fileChangeTimeout = undefined;
				try {
					await this.handleUpdate();
				} catch (error) {
					/* c8 ignore next 2 */
					this.logger.error(`FileStorageDriver '${this.name}' failed to update data: ${toError(error).message}`);
				}
			}, 100);
		}
	}

	/**
	 * Build file name from fileNameOrPromise
	 */
	private async getFileName(): Promise<string> {
		if (typeof this.fileName === 'function') {
			this.fileName = this.fileName();
		}
		const value = await this.fileName;
		if (typeof value !== 'string') {
			throw new TypeError(`FileStorageDriver '${this.name}' fileName argument must return a string, value: ${JSON.stringify(value)}`);
		}
		return value;
	}
}
