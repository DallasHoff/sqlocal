/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
	test: {
		browser: {
			enabled: true,
			headless: true,
			name: 'chrome',
		},
	},
	server: {
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
		},
	},
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
});
