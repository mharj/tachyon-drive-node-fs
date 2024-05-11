import {existsSync, type FSWatcher, watch} from 'node:fs';
import {type ExternalNotifyEventEmitterConstructor, type IExternalNotify} from 'tachyon-drive';
import {readFile, unlink, writeFile} from 'node:fs/promises';
import {EventEmitter} from 'events';
import {type ILoggerLike} from '@avanio/logger-like';
import type {Loadable} from '@luolapeikko/ts-common';

/**
 * FileUpdateNotify causes an event to be emitted when a file is updated.
 * - Can be used to notify when storage driver itself can't handle store change events.
 */
export class FileUpdateNotify extends (EventEmitter as ExternalNotifyEventEmitterConstructor) implements IExternalNotify {
	private isWriting = false;
	private fileName: Loadable<string>;
	private fileWatch: FSWatcher | undefined;
	private logger?: ILoggerLike;
	private currentFileTimeStamp?: Date;

	constructor(fileName: Loadable<string>, logger?: ILoggerLike) {
		super();
		this.fileName = fileName;
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
					this.emit('update', timeStamp);
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
		if (typeof this.fileName === 'function') {
			this.fileName = this.fileName();
		}
		return this.fileName;
	}
}
