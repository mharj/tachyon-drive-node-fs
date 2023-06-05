import {existsSync, FSWatcher, watch} from 'fs';
import {readFile, unlink, writeFile} from 'fs/promises';
import {IExternalNotify} from 'tachyon-drive';
import {ILoggerLike} from '@avanio/logger-like';

type EventualFileName = string | Promise<string> | (() => string | Promise<string>);

export class FileUpdateNotify implements IExternalNotify {
	private isWriting = false;
	private fileNameOrProvider: EventualFileName;
	private fileWatch: FSWatcher | undefined;
	private notifyListeners = new Set<(timeStamp: Date) => Promise<void>>();
	private logger?: ILoggerLike;
	private currentFileTimeStamp?: Date;

	constructor(fileName: EventualFileName, logger?: ILoggerLike) {
		this.fileNameOrProvider = fileName;
		this.logger = logger;
		this.setFileWatcher();
		this.fileWatcher = this.fileWatcher.bind(this);
	}

	public async init(): Promise<void> {
		this.logger?.debug(`FileUpdateNotify: init`);
		await writeFile(await this.getFileName(), '0'); // init file with Epoch 0
		return this.setFileWatcher();
	}

	public async unload(): Promise<void> {
		this.logger?.debug(`FileUpdateNotify: unload`);
		await this.unsetFileWatcher();
		return unlink(await this.getFileName());
	}

	public onUpdate(callback: (timeStamp: Date) => Promise<void>): void {
		this.notifyListeners.add(callback);
	}

	public async notifyUpdate(timeStamp: Date): Promise<void> {
		this.currentFileTimeStamp = timeStamp;
		this.isWriting = true;
		this.logger?.debug(`FileUpdateNotify: notifyUpdate: ${timeStamp.getTime()}`);
		await writeFile(await this.getFileName(), timeStamp.getTime().toString());
		this.isWriting = false;
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

	private async unsetFileWatcher(): Promise<boolean> {
		if (this.fileWatch) {
			this.fileWatch.close();
			return true;
		}
		// istanbul ignore next
		return false;
	}

	/**
	 * method for file watcher instance
	 */
	private async fileWatcher(event: 'rename' | 'change') {
		/* istanbul ignore next */
		// ignore watcher events if writing
		if (this.fileWatch && !this.isWriting && event === 'change') {
			try {
				const timeStamp = new Date(parseInt((await readFile(await this.getFileName())).toString(), 10));
				// check if notify file is updated from outside and then emit change
				if (this.currentFileTimeStamp?.getTime() !== timeStamp.getTime()) {
					this.currentFileTimeStamp = timeStamp; // update currentFileTimeStamp
					this.logger?.debug(`FileUpdateNotify: file change emit: ${timeStamp.getTime()}`);
					this.notifyListeners.forEach(async (callback) => {
						await callback(timeStamp);
					});
				}
			} catch (e) {
				this.logger?.error(`FileUpdateNotify: fileWatcher: ${e}`);
			}
		}
	}

	/**
	 * Build file name from fileNameOrPromise
	 */
	private async getFileName(): Promise<string> {
		const value = await (typeof this.fileNameOrProvider === 'function' ? this.fileNameOrProvider() : this.fileNameOrProvider);
		// istanbul ignore next
		if (typeof value !== 'string') {
			throw new TypeError(`FileUpdateNotify fileName argument must return a string, value: ${JSON.stringify(value)}`);
		}
		return value;
	}
}
