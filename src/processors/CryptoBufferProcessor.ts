import * as crypto from 'crypto';
import {IStoreProcessor} from 'tachyon-drive';

export class CryptoBufferProcessor implements IStoreProcessor<Buffer> {
	private key: string;

	constructor(key: Buffer) {
		this.key = crypto.createHash('sha256').update(key).digest('base64').slice(0, 32);
	}

	public async preStore(buffer: Buffer): Promise<Buffer> {
		return this.encryptPromise(buffer);
	}

	public async postHydrate(buffer: Buffer): Promise<Buffer> {
		return this.decryptPromise(buffer);
	}

	private encryptPromise(buffer: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const iv = crypto.randomBytes(12);
			const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
			const encrypted: Buffer[] = [];
			cipher.on('data', (chunk) => {
				encrypted.push(chunk);
			});
			cipher.on('end', () => {
				resolve(Buffer.concat([iv, cipher.getAuthTag(), ...encrypted]));
			});
			cipher.on('error', (err) => reject(err));
			cipher.write(buffer);
			cipher.end();
		});
	}

	private decryptPromise(buffer: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const iv = buffer.subarray(0, 12);
			const tag = buffer.subarray(12, 28);
			const encrypted = buffer.subarray(28);
			const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
			decipher.setAuthTag(tag);
			const decrypted: Buffer[] = [];
			decipher.on('readable', () => {
				let chunk = decipher.read();
				while (chunk !== null) {
					decrypted.push(chunk);
					chunk = decipher.read();
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
}
