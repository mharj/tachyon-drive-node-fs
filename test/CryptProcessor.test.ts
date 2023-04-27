/* eslint-disable no-unused-expressions */
import 'mocha';
import * as chai from 'chai';
import {CryptoBufferProcessor} from '../src/processors/CryptoBufferProcessor';
import {isValidStoreProcessor} from 'tachyon-drive';
const expect = chai.expect;
const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const data = Buffer.from('test');

let encryptedData: Buffer;

describe('CryptoProcessor', () => {
	it('should be empty store', async () => {
		encryptedData = await processor.preStore(data);
		expect(encryptedData).to.be.instanceOf(Buffer).and.length.greaterThan(0);
	});
	it('should store to storage driver', async () => {
		const decryptedData = await processor.postHydrate(encryptedData);
		expect(decryptedData).to.eql(data);
	});
	it('should be valid processor', async () => {
		expect(isValidStoreProcessor(processor)).to.be.true;
	});
});
