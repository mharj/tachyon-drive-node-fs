import 'mocha';
import * as chai from 'chai';
import {readFile, writeFile} from 'fs/promises';
import {existsSync} from 'fs';
import {FileUpdateNotify} from '../src/index.js';
import sinon from 'sinon';
const expect = chai.expect;

let notify: FileUpdateNotify;

const fileName = './test/test.ts';

function sleepPromise(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

const fileEventSpy = sinon.spy();

describe('FileUpdateNotify', function () {
	beforeEach(function () {
		fileEventSpy.resetHistory();
	});
	before(function () {
		notify = new FileUpdateNotify(() => fileName);
		notify.on('update', fileEventSpy);
	});
	it('should initialize notify service', async function () {
		await notify.init();
		expect((await readFile(fileName)).toString()).to.eql('0');
		expect(fileEventSpy.callCount).to.be.eql(0);
	});
	it('should initialize notify service', async function () {
		await notify.notifyUpdate(new Date(10));
		expect((await readFile(fileName)).toString()).to.eql('10');
		expect(fileEventSpy.callCount).to.be.eql(0); // no self notification
	});
	it('should notify when externally changed', async function () {
		await writeFile(fileName, '20');
		await sleepPromise(200);
		expect(fileEventSpy.callCount).to.be.eql(1);
		expect(fileEventSpy.getCall(0).args[0]).to.be.eql(new Date(20));
	});
	it('should be valid processor', async function () {
		await notify.unload();
		expect(existsSync(fileName)).to.be.equal(false);
		await notify.unload(); // should not throw
	});
	it('should get toString()', function () {
		expect(notify.toString()).to.be.equal(`FileUpdateNotify: fileName: ${fileName}`);
		expect(() => new FileUpdateNotify(() => fileName).toString(), 'not initialized yet').to.throw();
	});
	it('should get toJSON()', function () {
		expect(notify.toJSON()).to.be.eql({fileName, updated: 20});
		expect(() => new FileUpdateNotify(() => fileName).toJSON(), 'not initialized yet').to.throw();
	});
});
