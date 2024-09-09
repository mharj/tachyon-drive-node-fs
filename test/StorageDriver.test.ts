/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable sonarjs/no-duplicate-string */
import 'mocha';
import {CryptoBufferProcessor, FileStorageDriver, type FileStorageDriverOptions, FileUpdateNotify, strToBufferSerializer} from '../src/index.js';
import {type IPersistSerializer, type IStorageDriver, MemoryStorageDriver, nextSerializer} from 'tachyon-drive';
import {readFile, writeFile} from 'fs/promises';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import zod from 'zod';

chai.use(chaiAsPromised);

const expect = chai.expect;

const dataSchema = zod.object({
	test: zod.string(),
});

type Data = zod.infer<typeof dataSchema>;

const jsonSerialization: IPersistSerializer<Data, string> = {
	name: 'jsonSerialization',
	deserialize: (buffer: string) => JSON.parse(buffer.toString()),
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
			before(async function () {
				currentDriver.on('update', onUpdateSpy);
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
			});
			it('should be empty store', async function () {
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(onUpdateSpy.callCount).to.be.eq(0);
				expect(loadCryptoProcessor.callCount).to.be.eq(crypto ? 1 : 0);
			});
			it('should store to storage driver', async function () {
				await currentDriver.store(data);
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(onUpdateSpy.callCount).to.be.eq(0);
				expect(loadCryptoProcessor.callCount).to.be.eq(0); // crypto loads only once
			});
			it('should restore data from storage driver', async function () {
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(onUpdateSpy.callCount).to.be.eq(0);
				expect(loadCryptoProcessor.callCount).to.be.eq(0); // crypto loads only once
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
				expect(currentDriver.isInitialized).to.be.eq(false);
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should unload to storage driver', async function () {
				expect(currentDriver.isInitialized).to.be.eq(true);
				await currentDriver.unload();
				expect(currentDriver.isInitialized).to.be.eq(false);
				expect(onUpdateSpy.callCount).to.be.eq(0);

				await currentDriver.unload(); // should be safe to call multiple times
			});
		});
	});
	describe('Broken StorageDriver', function () {
		it('should fail to start if fileName is not valid', async function () {
			const brokenDriver = new FileStorageDriver('BrokenDriver', {} as FileStorageDriverOptions, bufferSerializer);
			await expect(brokenDriver.init()).to.be.eventually.rejectedWith(
				Error,
				`FileStorageDriver 'BrokenDriver' fileName argument must return a string, value: undefined`,
			);
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
			await expect(brokenDriver.store(data)).to.be.rejectedWith(TypeError, `FileStorageDriver 'BrokenSerializer' can only store Buffers`);
		});
	});
});
