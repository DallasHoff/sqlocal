/// <reference types="vitest" />
/// <reference types="@vitest/browser/providers/webdriverio" />
import { defineConfig } from 'vite';
import { externalizeDeps } from 'vite-plugin-externalize-deps';
import dts from 'vite-plugin-dts';

export default defineConfig({
	build: {
		lib: {
			name: 'SQLocal',
			formats: ['es'],
			entry: {
				index: 'src/index.ts',
				'drizzle/index': 'src/drizzle/index.ts',
				'kysely/index': 'src/kysely/index.ts',
			},
		},
		sourcemap: true,
	},
	worker: {
		format: 'es',
	},
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
	plugins: [
		dts({ tsconfigPath: './tsconfig.build.json' }),
		externalizeDeps(),
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
			instances: [{ browser: 'chrome' }],
		},
	},
});
