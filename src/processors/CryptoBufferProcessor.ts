import crypto from 'node:crypto';
import {type IStoreProcessor} from 'tachyon-drive';
import type {Loadable} from '@luolapeikko/ts-common';

/**
 * A processor that encrypts and decrypts Buffer data.
 * - Uses AES-256-GCM encryption (iv stored in the first 12 bytes, tag in the next 16 bytes)
 * - Secret Key is derived from a key buffer and build as sha256 hash key
 */
export class CryptoBufferProcessor implements IStoreProcessor<Buffer> {
	public readonly name = 'CryptoBufferProcessor';
	private buffer: Loadable<Buffer>;
	private key: string | undefined;

	private readonly algorithm: crypto.CipherGCMTypes = 'aes-256-gcm';

	constructor(keyBuffer: Loadable<Buffer>) {
		this.buffer = keyBuffer;
	}

	public async preStore(buffer: Buffer): Promise<Buffer> {
		return this.encryptPromise(buffer);
	}

	public async postHydrate(buffer: Buffer): Promise<Buffer> {
		return this.decryptPromise(buffer);
	}

	private async getKey(): Promise<string> {
		if (!this.key) {
			this.key = crypto
				.createHash('sha256')
				.update(await this.getBuffer())
				.digest('base64')
				.slice(0, 32);
		}
		return this.key;
	}

	private async getBuffer(): Promise<Buffer> {
		if (typeof this.buffer === 'function') {
			this.buffer = this.buffer();
		}
		return this.buffer;
	}

	private async encryptPromise(buffer: Buffer): Promise<Buffer> {
		const key = await this.getKey();
		return new Promise((resolve, reject) => {
			const iv = crypto.randomBytes(12);
			const cipher = crypto.createCipheriv(this.algorithm, key, iv);
			const encrypted: Buffer[] = [];
			cipher.on('data', (chunk) => {
				encrypted.push(chunk as Buffer);
			});
			cipher.on('end', () => {
				resolve(Buffer.concat([iv, cipher.getAuthTag(), ...encrypted]));
			});
			cipher.on('error', (err) => reject(err));
			cipher.write(buffer);
			cipher.end();
		});
	}

	private async decryptPromise(buffer: Buffer): Promise<Buffer> {
		const key = await this.getKey();
		return new Promise((resolve, reject) => {
			const iv = buffer.subarray(0, 12);
			const tag = buffer.subarray(12, 28);
			const encrypted = buffer.subarray(28);
			const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
			decipher.setAuthTag(tag);
			const decrypted: Buffer[] = [];
			decipher.on('readable', () => {
				let chunk = decipher.read() as Buffer | null;
				while (chunk !== null) {
					decrypted.push(chunk);
					chunk = decipher.read() as Buffer | null;
				}
			});
			decipher.on('end', () => {
				resolve(Buffer.concat(decrypted));
			});
			decipher.on('error', (err) => reject(err));
			decipher.write(encrypted);
			decipher.end();
		});
	}

	public toString() {
		return `${this.name} algorithm: ${this.algorithm}`;
	}

	public toJSON() {
		return {
			name: this.name,
			algorithm: this.algorithm,
		};
	}
}
