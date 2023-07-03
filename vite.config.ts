import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	build: {
		lib: {
			name: 'SQLocal',
			entry: [resolve(__dirname, 'src/index.ts')],
		},
	},
	plugins: [
		{
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
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm'],
	},
});
