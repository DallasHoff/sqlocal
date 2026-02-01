import type { Plugin, UserConfig } from 'vite';

export type VitePluginConfig = {
	/**
	 * If set to `false`, the plugin will not add the
	 * HTTP response headers required for
	 * [cross-origin isolation](https://sqlocal.dev/guide/setup#cross-origin-isolation)
	 * to the Vite development server.
	 * @default true
	 */
	coi?: boolean;
};

export default function vitePluginSQLocal(
	config: VitePluginConfig = { coi: true }
): Plugin<UserConfig> {
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
			if (config.coi !== false) {
				server.middlewares.use((_, res, next) => {
					res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
					res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
					next();
				});
			}
		},
	};
}
