/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
	test: {
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
