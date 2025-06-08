/// <reference types="vitest" />
/// <reference types="@vitest/browser/providers/webdriverio" />
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
			instances: [
				{ browser: 'chrome', headless: true },
				{ browser: 'safari', headless: false },
			],
		},
	},
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
	plugins: [
		{
			enforce: 'pre',
			name: 'configure-response-headers',
			configureServer: (server) => {
				server.middlewares.use((_req, res, next) => {
					res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
					res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
					next();
				});
			},
		},
	],
});
