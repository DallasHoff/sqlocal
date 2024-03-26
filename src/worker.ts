import { SQLocalProcessor } from './processor.js';

const processor = new SQLocalProcessor();

self.onmessage = (message) => processor.postMessage(message);
processor.onmessage = (message) => self.postMessage(message);
