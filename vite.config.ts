/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
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
			name: 'chrome',
		},
	},
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
	server: {
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
		},
	},
});
