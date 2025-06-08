import { SQLiteOpfsSahDriver } from './drivers/sqlite-opfs-sah-driver.js';
import { SQLocalProcessor } from './processor.js';

const driver = new SQLiteOpfsSahDriver(); // TODO: temporarily changed for testing
const processor = new SQLocalProcessor(driver);

self.onmessage = (message) => {
	processor.postMessage(message);
};

processor.onmessage = (message, transfer) => {
	self.postMessage(message, transfer);
};
