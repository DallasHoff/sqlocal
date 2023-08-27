import { SQLocalProcessor } from './processor';

const processor = new SQLocalProcessor();

self.onmessage = processor.processMessage;
processor.addMessageListener(postMessage);
