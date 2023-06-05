/* eslint-disable no-unused-expressions */
import 'mocha';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {readFile, writeFile} from 'fs/promises';
import {existsSync} from 'fs';
import {FileUpdateNotify} from '../src/notify/FileUpdateNotify';
const expect = chai.expect;

let notify: FileUpdateNotify;

const fileName = './test/test.ts';

function sleepPromise(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

const fileEventSpy = sinon.spy();

describe('FileUpdateNotify', () => {
	beforeEach(() => {
		fileEventSpy.resetHistory();
	});
	before(async () => {
		notify = new FileUpdateNotify(fileName);
		notify.onUpdate(fileEventSpy);
	});
	it('should initialize notify service', async () => {
		await notify.init();
		expect((await readFile(fileName)).toString()).to.eql('0');
		expect(fileEventSpy.callCount).to.be.eql(0);
	});
	it('should initialize notify service', async () => {
		await notify.notifyUpdate(new Date(10));
		expect((await readFile(fileName)).toString()).to.eql('10');
		expect(fileEventSpy.callCount).to.be.eql(0); // no self notification
	});
	it('should notify when externally changed', async () => {
		await writeFile(fileName, '20');
		await sleepPromise(20);
		expect(fileEventSpy.callCount).to.be.eql(1);
		expect(fileEventSpy.getCall(0).args[0]).to.be.eql(new Date(20));
	});
	it('should be valid processor', async () => {
		await notify.unload();
		expect(existsSync(fileName)).to.be.false;
	});
});
