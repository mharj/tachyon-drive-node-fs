import {existsSync, type FSWatcher, watch} from 'fs';
import {type IPersistSerializer, type IStoreProcessor, StorageDriver} from 'tachyon-drive';
import {readFile, unlink, writeFile} from 'fs/promises';
import type {ILoggerLike} from '@avanio/logger-like';
import type {Loadable} from '@luolapeikko/ts-common';

type EventualFileName = string | Promise<string> | (() => string | Promise<string>);

/**
 * A storage driver that uses the local file system to store files.
 */
export class FileStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private isWriting = false;
	private fileNameOrPromise: EventualFileName;
	private fileWatch: FSWatcher | undefined;

	private fileChangeTimeout: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Creates a new instance of the `FileStorageDriver` class.
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
		processor?: Loadable<IStoreProcessor<Buffer>>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, null, processor, logger);
		this.fileNameOrPromise = fileName;
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
		// buffer sainity check
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

	private async unsetFileWatcher(): Promise<boolean> {
		if (this.fileWatch) {
			this.fileWatch.close();
			return true;
		}
		return false;
	}

	/**
	 * method for file watcher instance
	 */
	private async fileWatcher(event: 'rename' | 'change') {
		/* istanbul ignore next */
		// ignore watcher events if writing
		if (!this.isWriting && event === 'change') {
			if (this.fileChangeTimeout) {
				clearTimeout(this.fileChangeTimeout);
			}
			// delay to avoid multiple file change events
			this.fileChangeTimeout = setTimeout(() => {
				this.fileChangeTimeout = undefined;
				this.handleUpdate();
			}, 100);
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
