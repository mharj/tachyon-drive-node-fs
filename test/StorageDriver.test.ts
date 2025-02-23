import {readFile, writeFile} from 'fs/promises';
import sinon from 'sinon';
import {type IPersistSerializer, type IStorageDriver, MemoryStorageDriver, nextSerializer} from 'tachyon-drive';
import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {z} from 'zod';
import {CryptoBufferProcessor, FileStorageDriver, type FileStorageDriverOptions, FileUpdateNotify, strToBufferSerializer} from '../src/index.js';

const dataSchema = z.object({
	test: z.string(),
});

type Data = z.infer<typeof dataSchema>;

const jsonSerialization: IPersistSerializer<Data, string> = {
	name: 'jsonSerialization',
	deserialize: (buffer: string) => JSON.parse(buffer.toString()) as Data,
	serialize: (data: Data) => JSON.stringify(data),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

const bufferSerializer: IPersistSerializer<Data, Buffer> = nextSerializer<Data, string, Buffer>(jsonSerialization, strToBufferSerializer);

const objectSerializer: IPersistSerializer<Data, Data> = {
	name: 'objectSerializer',
	deserialize: (value: Data) => ({...value}),
	serialize: (data: Data) => ({...data}),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

function sleepPromise(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

const loadCryptoProcessor = sinon.spy(function () {
	// const {CryptoBufferProcessor} = await import('tachyon-drive-node-fs'); // dynamic loading
	return new CryptoBufferProcessor(() => Buffer.from('some-secret-key'));
});

const driverSet = new Set<{driver: IStorageDriver<Data>; fileName?: string; crypto: boolean}>([
	{
		driver: new MemoryStorageDriver('MemoryStorageDriver', objectSerializer, new FileUpdateNotify('./test/update.notify')),
		fileName: './test/update.notify',
		crypto: false,
	},
	{
		driver: new FileStorageDriver('FileStorageDriver - file: string', {fileName: './test/test.json'}, bufferSerializer),
		fileName: './test/test.json',
		crypto: false,
	},
	{
		driver: new FileStorageDriver('FileStorageDriver - file: Promise<string>', {fileName: Promise.resolve('./test/test.json')}, bufferSerializer),
		fileName: './test/test.json',
		crypto: false,
	},
	{
		driver: new FileStorageDriver('CryptFileStorageDriver - file: () => string', {fileName: () => './test/test.aes'}, bufferSerializer, loadCryptoProcessor),
		fileName: './test/test.aes',
		crypto: true,
	},
	{
		driver: new FileStorageDriver(
			'CryptFileStorageDriver - file: () => Promise<string>',
			{fileName: () => Promise.resolve('./test/test.aes')},
			bufferSerializer,
			loadCryptoProcessor,
		),
		fileName: './test/test.aes',
		crypto: true,
	},
]);

const data = dataSchema.parse({test: 'demo'});

const onUpdateSpy = sinon.spy((_value: Data | undefined) => {});

describe('StorageDriver', function () {
	driverSet.forEach(({driver: currentDriver, fileName, crypto}) => {
		describe(currentDriver.name, function () {
			beforeEach(function () {
				onUpdateSpy.resetHistory();
				loadCryptoProcessor.resetHistory();
			});
			beforeAll(async function () {
				currentDriver.on('update', onUpdateSpy);
				await currentDriver.clear();
				expect(currentDriver.isInitialized).equals(false);
			});
			it('should be empty store', async function () {
				await expect(currentDriver.hydrate()).resolves.toEqual(undefined);
				expect(currentDriver.isInitialized).equals(true);
				expect(onUpdateSpy.callCount).equals(0);
				expect(loadCryptoProcessor.callCount).equals(crypto ? 1 : 0);
			});
			it('should store to storage driver', async function () {
				await currentDriver.store(data);
				await expect(currentDriver.hydrate()).resolves.toStrictEqual(data);
				expect(currentDriver.isInitialized).equals(true);
				expect(onUpdateSpy.callCount).equals(0);
				expect(loadCryptoProcessor.callCount).equals(0); // crypto loads only once
			});
			it('should restore data from storage driver', async function () {
				await expect(currentDriver.hydrate()).resolves.toStrictEqual(data);
				expect(currentDriver.isInitialized).equals(true);
				expect(onUpdateSpy.callCount).equals(0);
				expect(loadCryptoProcessor.callCount).equals(0); // crypto loads only once
			});
			it('should noticed external file change and notify', async function () {
				if (fileName) {
					// MemoryStorageDriver with FileUpdateNotify does need actual time change to trigger update
					if (currentDriver instanceof MemoryStorageDriver) {
						await writeFile(fileName, new Date().getTime().toString());
					} else {
						await writeFile(fileName, await readFile(fileName));
					}
					await sleepPromise(200);
					expect(onUpdateSpy.callCount).to.be.greaterThan(0);
				}
			});
			it('should clear to storage driver', async function () {
				await currentDriver.clear();
				expect(currentDriver.isInitialized).equals(false);
				await expect(currentDriver.hydrate()).resolves.toEqual(undefined);
				expect(currentDriver.isInitialized).equals(true);
			});
			it('should unload to storage driver', async function () {
				expect(currentDriver.isInitialized).equals(true);
				await currentDriver.unload();
				expect(currentDriver.isInitialized).equals(false);
				expect(onUpdateSpy.callCount).equals(0);

				await currentDriver.unload(); // should be safe to call multiple times
			});
		});
	});
	describe('Broken StorageDriver', function () {
		it('should fail to start if fileName is not valid', async function () {
			const brokenDriver = new FileStorageDriver('BrokenDriver', {} as FileStorageDriverOptions, bufferSerializer);
			await expect(brokenDriver.init()).to.rejects.toThrowError(`FileStorageDriver 'BrokenDriver' fileName argument must return a string, value: undefined`);
		});
	});
	describe('Broken serializer', function () {
		it('should throw error if serialized does not provide buffer data', async function () {
			const brokenSerializer = {
				serialize: (data: Data) => data,
				deserialize: (buffer: Buffer) => buffer,
				validator: (data: Data) => dataSchema.safeParse(data).success,
			} as unknown as IPersistSerializer<Data, Buffer>;

			const brokenDriver = new FileStorageDriver('BrokenSerializer', {fileName: './test/test.json'}, brokenSerializer);
			await expect(brokenDriver.store(data)).to.rejects.toThrowError(`FileStorageDriver 'BrokenSerializer' can only store Buffers`);
		});
	});
});
