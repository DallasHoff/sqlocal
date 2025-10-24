import type { Plugin, UserConfig } from 'vite';

export default function sqlocalPlugin(): Plugin<UserConfig> {
	return {
		name: 'vite-plugin-sqlocal',
		config(config): UserConfig {
			return {
				optimizeDeps: {
					exclude: [...(config.optimizeDeps?.exclude ?? []), 'sqlocal'],
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
