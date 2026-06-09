import path from 'node:path';
import { fileURLToPath } from 'node:url';
import codspeedPlugin from '@codspeed/vitest-plugin';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolvePath = (...segments: string[]) => path.resolve(__dirname, ...segments);

const alias = {
	model: resolvePath('src/model'),
	renderer: resolvePath('src/renderer'),
	shared: resolvePath('src/shared'),
	util: resolvePath('src/util'),
	'electron/main': resolvePath('test-support/electron-main.ts'),
	'electron/common': resolvePath('test-support/electron-common.ts'),
	'electron/renderer': resolvePath('test-support/electron-renderer.ts')
};

export default defineConfig({
	plugins: [codspeedPlugin()],
	resolve: {
		alias
	},
	test: {
		environment: 'node',
		include: [],
		benchmark: {
			include: ['src/__benchmarks__/**/*.bench.ts']
		}
	}
});
