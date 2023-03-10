import * as zod from 'zod';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import {MemoryStorageDriver, IPersistSerializer, IStorageDriver} from 'tachyon-drive';
import {FileStorageDriver} from '../src/drivers/FileStorageDriver';
import {CryptoBufferProcessor} from '../src/processors/CryptoBufferProcessor';

chai.use(chaiAsPromised);

const expect = chai.expect;

const dataSchema = zod.object({
	test: zod.string(),
});

type Data = zod.infer<typeof dataSchema>;

const bufferSerializer: IPersistSerializer<Data, Buffer> = {
	serialize: (data: Data) => Buffer.from(JSON.stringify(data)),
	deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

const objectSerializer: IPersistSerializer<Data, Data> = {
	serialize: (data: Data) => ({...data}),
	deserialize: (value: Data) => ({...value}),
	validator: (data: Data) => dataSchema.safeParse(data).success,
};

const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const driverSet = new Set<IStorageDriver<Data>>([
	new MemoryStorageDriver('MemoryStorageDriver', objectSerializer),
	new FileStorageDriver('FileStorageDriver', './test/test.json', bufferSerializer),
	new FileStorageDriver('CryptFileStorageDriver', async () => './test/test.aes', bufferSerializer, processor),
]);

const data = dataSchema.parse({test: 'demo'});

describe('StorageDriver', () => {
	driverSet.forEach((currentDriver) => {
		describe(currentDriver.name, () => {
			before(async () => {
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
			});
			it('should be empty store', async () => {
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should store to storage driver', async () => {
				await currentDriver.store(data);
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should restore data from storage driver', async () => {
				expect(await currentDriver.hydrate()).to.eql(data);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
			it('should clear to storage driver', async () => {
				await currentDriver.clear();
				expect(currentDriver.isInitialized).to.be.eq(false);
				expect(await currentDriver.hydrate()).to.eq(undefined);
				expect(currentDriver.isInitialized).to.be.eq(true);
			});
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
