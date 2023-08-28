import { SQLocalProcessor } from './processor';

const processor = new SQLocalProcessor();

self.onmessage = (message) => processor.postMessage(message);
processor.onmessage = (message) => self.postMessage(message);
