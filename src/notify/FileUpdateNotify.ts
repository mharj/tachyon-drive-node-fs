import {EventEmitter} from 'events';
import {existsSync, type FSWatcher, watch} from 'node:fs';
import {readFile, unlink, writeFile} from 'node:fs/promises';
import {type ILoggerLike} from '@avanio/logger-like';
import {type Loadable, toError} from '@luolapeikko/ts-common';
import {type ExternalNotifyEventsMap, type IExternalNotify} from 'tachyon-drive';

/**
 * FileUpdateNotify causes an event to be emitted when a file is updated.
 * - Can be used to notify when storage driver itself can't handle store change events.
 */
export class FileUpdateNotify extends EventEmitter<ExternalNotifyEventsMap> implements IExternalNotify {
	private isWriting = false;
	private fileNameLoadable: Loadable<string>;
	private fileName: string | undefined;
	private fileWatch: FSWatcher | undefined;
	private logger?: ILoggerLike;
	private currentFileTimeStamp?: Date;

	private fileChangeTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(fileName: Loadable<string>, logger?: ILoggerLike) {
		super();
		this.fileNameLoadable = fileName;
		this.logger = logger;
		this.fileWatcher = this.fileWatcher.bind(this);
	}

	public async init(): Promise<void> {
		this.logger?.debug(`FileUpdateNotify: init`);
		const fileName = await this.getFileName();
		if (existsSync(fileName)) {
			this.currentFileTimeStamp = await this.getFileTimestamp();
		} else {
			await writeFile(fileName, '0'); // init file with Epoch 0
		}
		return this.setFileWatcher();
	}

	public async unload(): Promise<void> {
		this.logger?.debug(`FileUpdateNotify: unload`);
		await this.unsetFileWatcher();
		const fileName = await this.getFileName();
		if (existsSync(fileName)) {
			return unlink(fileName);
		}
	}

	public async notifyUpdate(timeStamp: Date): Promise<void> {
		this.currentFileTimeStamp = timeStamp;
		this.isWriting = true;
		this.logger?.debug(`FileUpdateNotify: notifyUpdate: ${timeStamp.getTime().toString()}`);
		await writeFile(await this.getFileName(), timeStamp.getTime().toString());
		this.isWriting = false;
	}

	public toString(): string {
		this.assertIsInitialized(this.fileName);
		return `${this.constructor.name}: fileName: ${this.fileName}`;
	}

	public toJSON() {
		this.assertIsInitialized(this.fileName);
		return {
			fileName: this.fileName,
			updated: this.currentFileTimeStamp?.getTime(),
		};
	}

	/**
	 * Set file watcher if file exists
	 */
	private async setFileWatcher(): Promise<void> {
		if (!this.fileWatch) {
			const fileName = await this.getFileName();
			if (existsSync(fileName)) {
				this.logger?.debug(`FileUpdateNotify: setFileWatcher: ${fileName}`);
				this.fileWatch = watch(fileName, {}, this.fileWatcher);
			}
		}
	}

	private unsetFileWatcher(): Promise<boolean> {
		if (this.fileWatch) {
			this.fileWatch.close();
			this.fileWatch = undefined;
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
	}

	/**
	 * method for file watcher instance
	 */
	private fileWatcher(event: 'rename' | 'change') {
		// ignore watcher events if writing
		if (this.fileWatch && !this.isWriting && event === 'change') {
			if (this.fileChangeTimeout) {
				clearTimeout(this.fileChangeTimeout);
			}
			// delay to avoid multiple file change events
			this.fileChangeTimeout = setTimeout(async () => {
				try {
					const timeStamp = await this.getFileTimestamp();
					// check if notify file is updated from outside and then emit change
					if (this.currentFileTimeStamp?.getTime() !== timeStamp.getTime()) {
						this.currentFileTimeStamp = timeStamp; // update currentFileTimeStamp
						this.logger?.debug(`FileUpdateNotify: file change emit: ${timeStamp.getTime().toString()}`);
						this.emit('update', timeStamp);
					}
				} catch (e) {
					/* c8 ignore next 2 */
					this.logger?.error(`FileUpdateNotify: fileWatcher: ${toError(e).message}`);
				}
			}, 100);
		}
	}

	private async getFileTimestamp(): Promise<Date> {
		return new Date(parseInt((await readFile(await this.getFileName())).toString(), 10));
	}

	/**
	 * Build file name from fileNameOrPromise
	 */
	private async getFileName(): Promise<string> {
		if (typeof this.fileNameLoadable === 'function') {
			this.fileNameLoadable = this.fileNameLoadable();
		}
		this.fileName = await this.fileNameLoadable;
		return this.fileNameLoadable;
	}

	private assertIsInitialized(fileName: string | undefined): asserts fileName is string {
		if (!fileName) {
			throw new Error(`${this.constructor.name} is not initialized yet`);
		}
	}
}
