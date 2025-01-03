import { SQLocalOpfsDriver } from './drivers/opfs-driver.js';
import { SQLocalProcessor } from './processor.js';

const driver = new SQLocalOpfsDriver();
const processor = new SQLocalProcessor(driver, false);

self.onmessage = (message) => {
	processor.postMessage(message);
};

processor.onmessage = (message, transfer) => {
	self.postMessage(message, transfer);
};
