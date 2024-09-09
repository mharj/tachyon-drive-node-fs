import 'mocha';
import * as chai from 'chai';
import {CryptoBufferProcessor} from '../src/index.js';
import {isValidStoreProcessor} from 'tachyon-drive';
const expect = chai.expect;
const processor = new CryptoBufferProcessor(Buffer.from('some-secret-key'));

const data = Buffer.from('test');

let encryptedData: Buffer;

describe('CryptoProcessor', function () {
	it('should be empty store', async function () {
		encryptedData = await processor.preStore(data);
		expect(encryptedData).to.be.instanceOf(Buffer).and.length.greaterThan(0);
	});
	it('should store to storage driver', async function () {
		const decryptedData = await processor.postHydrate(encryptedData);
		expect(decryptedData).to.eql(data);
	});
	it('should be valid processor', function () {
		expect(isValidStoreProcessor(processor)).to.be.equal(true);
	});
	it('should get toString()', function () {
		expect(processor.toString()).to.be.equal('CryptoBufferProcessor algorithm: aes-256-gcm');
	});
	it('should get toJSON()', function () {
		expect(processor.toJSON()).to.be.eql({name: 'CryptoBufferProcessor', algorithm: 'aes-256-gcm'});
	});
});
