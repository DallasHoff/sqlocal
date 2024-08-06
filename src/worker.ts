import { SQLocalProcessor } from './processor.js';

const processor = new SQLocalProcessor(self);

self.onmessage = (message) => {
	processor.postMessage(message);
};

processor.onmessage = (message, transfer) => {
	self.postMessage(message, transfer);
};
