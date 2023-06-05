/* eslint-disable sonarjs/no-duplicate-string */
import 'mocha';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import * as zod from 'zod';
import {IPersistSerializer, IStorageDriver, MemoryStorageDriver, nextSerializer} from 'tachyon-drive';
import {readFile, writeFile} from 'fs/promises';
import {CryptoBufferProcessor} from '../src/processors/CryptoBufferProcessor';
import {FileStorageDriver} from '../src/drivers/FileStorageDriver';
import {FileUpdateNotify, strToBufferSerializer} from '../src/';

chai.use(chaiAsPromised);

const expect = chai.expect;

const dataSchema = zod.object({
	test: zod.string(),
});

type Data = zod.infer<typeof dataSchema>;

const jsonSerialization: IPersistSerializer<Data, string> = {
	deserialize: (buffer: string) => JSON.parse(buffer.toString()),
	serialize: (data: Data) => JSON.stringify(data),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

const bufferSerializer: IPersistSerializer<Data, Buffer> = nextSerializer<Data, string, Buffer>(jsonSerialization, strToBufferSerializer);

const objectSerializer: IPersistSerializer<Data, Data> = {
	deserialize: (value: Data) => ({...value}),
	serialize: (data: Data) => ({...data}),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const driverSet = new Set<{driver: IStorageDriver<Data>; fileName?: string}>([
	{driver: new MemoryStorageDriver('MemoryStorageDriver', objectSerializer, new FileUpdateNotify('./test/update.notify')), fileName: './test/update.notify'},
	{driver: new FileStorageDriver('FileStorageDriver - file: string', './test/test.json', bufferSerializer), fileName: './test/test.json'},
	{
		driver: new FileStorageDriver('FileStorageDriver - file: Promise<string>', Promise.resolve('./test/test.json'), bufferSerializer),
		fileName: './test/test.json',
	},
	{
		driver: new FileStorageDriver('CryptFileStorageDriver - file: () => string', () => './test/test.aes', bufferSerializer, processor),
		fileName: './test/test.aes',
	},
	{
		driver: new FileStorageDriver('CryptFileStorageDriver - file: () => Promise<string>', async () => './test/test.aes', bufferSerializer, processor),
		fileName: './test/test.aes',
	},
]);

const data = dataSchema.parse({test: 'demo'});

const onUpdateSpy = sinon.spy();

describe('StorageDriver', () => {
	driverSet.forEach(({driver: currentDriver, fileName}) => {
		describe(currentDriver.name, () => {
			beforeEach(() => {
				onUpdateSpy.resetHistory();
			});
			before(async () => {
				currentDriver.onUpdate(onUpdateSpy);
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
			});
			it('should be empty store', async () => {
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(onUpdateSpy.callCount).to.be.eq(0);
			});
			it('should store to storage driver', async () => {
				await currentDriver.store(data);
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(onUpdateSpy.callCount).to.be.eq(0);
			});
			it('should restore data from storage driver', async () => {
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
				expect(onUpdateSpy.callCount).to.be.eq(0);
			});
			it('should noticed external file change and notify', async () => {
				if (fileName) {
					// MemoryStorageDriver with FileUpdateNotify does need actual time change to trigger update
					if (currentDriver instanceof MemoryStorageDriver) {
						await writeFile(fileName, new Date().getTime().toString());
					} else {
						await writeFile(fileName, await readFile(fileName));
					}
					expect(onUpdateSpy.callCount).to.be.greaterThan(0);
				}
			});
			it('should clear to storage driver', async () => {
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should unload to storage driver', async () => {
				expect(currentDriver.isInitialized).to.be.eq(true);
				await currentDriver.unload();
				expect(currentDriver.isInitialized).to.be.eq(false);
				expect(onUpdateSpy.callCount).to.be.eq(0);
			});
		});
	});
	describe('Broken StorageDriver', () => {
		it('should fail to start if fileName is not valid', async () => {
			const brokenDriver = new FileStorageDriver('BrokenDriver', {} as string, bufferSerializer);
			await expect(brokenDriver.init()).to.be.eventually.rejectedWith(
				Error,
				`FileStorageDriver 'BrokenDriver' fileName argument must return a string, value: {}`,
			);
		});
	});
	describe('Broken serializer', () => {
		it('should throw error if serialized does not provide buffer data', async () => {
			const brokenSerializer = {
				serialize: (data: Data) => data,
				deserialize: (buffer: Buffer) => buffer,
				validator: (data: Data) => dataSchema.safeParse(data).success,
			} as unknown as IPersistSerializer<Data, Buffer>;

			const brokenDriver = new FileStorageDriver('BrokenSerializer', './test/test.json', brokenSerializer);
			await expect(brokenDriver.store(data)).to.be.rejectedWith(TypeError, `FileStorageDriver 'BrokenSerializer' can only store Buffers`);
		});
	});
});
