import { SQLiteOpfsDriver } from './drivers/sqlite-opfs-driver.js';
import { SQLocalProcessor } from './processor.js';

const driver = new SQLiteOpfsDriver();
const processor = new SQLocalProcessor(driver);

self.onmessage = (message) => {
	processor.postMessage(message);
};

processor.onmessage = (message, transfer) => {
	self.postMessage(message, transfer);
};
