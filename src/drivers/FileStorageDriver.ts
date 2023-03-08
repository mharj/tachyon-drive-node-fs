import {readFile, writeFile, unlink} from 'fs/promises';
import {existsSync, watchFile, unwatchFile, Stats} from 'fs';
import {StorageDriver, IStoreProcessor, IPersistSerializer, ILoggerLike} from 'tachyon-drive';

export class FileStorageDriver<Input> extends StorageDriver<Input, Buffer> {
	private isWriting = false;
	private fileName: string;
	private fileWatch = false;

	constructor(
		name: string,
		fileName: string,
		serializer: IPersistSerializer<Input, Buffer>,
		processor?: IStoreProcessor<Buffer>,
		logger?: ILoggerLike | Console,
	) {
		super(name, serializer, processor, logger);
		this.fileName = fileName;
		this.fileWatcher = this.fileWatcher.bind(this);
	}

	protected handleInit(): Promise<boolean> {
		this.setFileWatcher();
		return Promise.resolve(true);
	}

	protected async handleStore(buffer: Buffer): Promise<void> {
		// buffer sainity check
		if (!Buffer.isBuffer(buffer)) {
			throw new TypeError(`FileStorageDriver '${this.name}' can only store Buffers`);
		}
		this.isWriting = true;
		await writeFile(this.fileName, buffer);
		this.setFileWatcher();
		this.isWriting = false;
	}

	protected async handleHydrate(): Promise<Buffer | undefined> {
		if (existsSync(this.fileName)) {
			const buffer = await readFile(this.fileName);
			this.setFileWatcher();
			return buffer;
		}
		return undefined;
	}

	protected async handleClear(): Promise<void> {
		if (this.fileWatch) {
			unwatchFile(this.fileName, this.fileWatcher);
			this.fileWatch = false;
		}
		if (existsSync(this.fileName)) {
			this.isWriting = true;
			await unlink(this.fileName);
			this.isWriting = false;
		}
		await this.handleUpdate(); // emit change
	}

	private setFileWatcher() {
		if (!this.fileWatch && existsSync(this.fileName)) {
			watchFile(this.fileName, this.fileWatcher);
			this.fileWatch = true;
		}
	}

	private async fileWatcher(_curr: Stats, _prev: Stats) {
		if (!this.isWriting) {
			await this.handleUpdate();
		}
	}
}
