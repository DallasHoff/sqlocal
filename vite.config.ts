/// <reference types="vitest" />
/// <reference types="@vitest/browser/providers/webdriverio" />
import { defineConfig } from 'vite';
import sqlocal from './src/vite';

export default defineConfig({
	plugins: [sqlocal()],
	test: {
		testTimeout: 1000,
		hookTimeout: 1000,
		teardownTimeout: 1000,
		includeTaskLocation: true,
		browser: {
			enabled: true,
			headless: true,
			screenshotFailures: false,
			provider: 'webdriverio',
			instances: [
				{ browser: 'chrome', headless: true },
				{ browser: 'safari', headless: false },
			],
		},
	},
});
