import * as chai from 'chai';
import 'mocha';
import {MemoryStorageDriver, IPersistSerializer, IStorageDriver} from 'tachyon-drive';
import {FileStorageDriver} from '../src/drivers/FileStorageDriver';
import {CryptoBufferProcessor} from '../src/processors/CryptoBufferProcessor';

const expect = chai.expect;

interface Data {
	test: string;
}

const bufferSerializer: IPersistSerializer<Data, Buffer> = {
	serialize: (data: Data) => Buffer.from(JSON.stringify(data)),
	deserialize: (buffer: Buffer) => JSON.parse(buffer.toString()),
};

const objectSerializer: IPersistSerializer<Data, Data> = {
	serialize: (data: Data) => ({...data}),
	deserialize: (value: Data) => ({...value}),
};

const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const driverSet = new Set<IStorageDriver<Data>>([
	new MemoryStorageDriver('MemoryStorageDriver', objectSerializer),
	new FileStorageDriver('FileStorageDriver', './test/test.json', bufferSerializer),
	new FileStorageDriver('CryptFileStorageDriver', './test/test.aes', bufferSerializer, processor),
]);

const data: Data = {test: 'demo'};

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
});
