import type { Plugin, UserConfig } from 'vite';

export default function sqlocalPlugin(): Plugin<UserConfig> {
	return {
		name: 'vite-plugin-sqlocal',
		enforce: 'pre',
		config(config): UserConfig {
			return {
				optimizeDeps: {
					...config.optimizeDeps,
					exclude: [
						...(config.optimizeDeps?.exclude ?? []),
						'sqlocal',
						'@sqlite.org/sqlite-wasm',
					],
				},
				worker: {
					...config.worker,
					format: 'es',
				},
			};
		},
		configureServer(server): void {
			server.middlewares.use((_, res, next) => {
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
				next();
			});
		},
	};
}
