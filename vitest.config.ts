import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolvePath = (...segments: string[]) => path.resolve(__dirname, ...segments);

export default defineConfig({
	resolve: {
		alias: {
			model: resolvePath('src/model'),
			renderer: resolvePath('src/renderer'),
			shared: resolvePath('src/shared'),
			util: resolvePath('src/util'),
			'electron/main': resolvePath('test-support/electron-main.ts'),
			'electron/common': resolvePath('test-support/electron-common.ts'),
			'electron/renderer': resolvePath('test-support/electron-renderer.ts')
		}
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		clearMocks: true,
		restoreMocks: true,
		testTimeout: 15000,
		exclude: ['release/**', 'node_modules/**']
	}
});
