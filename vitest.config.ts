import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolvePath = (...segments: string[]) => path.resolve(__dirname, ...segments);
const routeSwitchBenchmarkEnabled = process.env.TTSMM_ROUTE_BENCH === '1';
const rendererTestExclude = routeSwitchBenchmarkEnabled ? [] : ['src/__tests__/renderer/route-switch-latency.test.tsx'];
const ciEnabled = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const vitestReportDir = process.env.VITEST_REPORT_DIR ?? 'reports/vitest';
const reporters = ciEnabled ? ['default', ...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions'] : []), 'junit'] : ['default'];
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
	resolve: {
		alias
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['./vitest.setup.ts'],
		clearMocks: true,
		restoreMocks: true,
		reporters,
		outputFile: ciEnabled ? { junit: path.join(vitestReportDir, 'junit.xml') } : undefined,
		maxWorkers: 4,
		slowTestThreshold: 1000,
		testTimeout: 15000,
		exclude: ['release/**', 'node_modules/**'],
		projects: [
			{
				resolve: {
					alias
				},
				test: {
					name: 'renderer',
					environment: 'jsdom',
					setupFiles: ['./vitest.setup.ts'],
					clearMocks: true,
					restoreMocks: true,
					maxWorkers: 4,
					testTimeout: 15000,
					include: ['src/__tests__/renderer/**/*.test.{ts,tsx}', 'src/__tests__/model/**/*.test.ts', 'src/__tests__/App.test.tsx'],
					exclude: ['release/**', 'node_modules/**', ...rendererTestExclude]
				}
			},
			{
				resolve: {
					alias
				},
				test: {
					name: 'node',
					environment: 'node',
					setupFiles: ['./vitest.setup.ts'],
					clearMocks: true,
					restoreMocks: true,
					maxWorkers: 4,
					testTimeout: 15000,
					include: ['src/__tests__/main/**/*.test.ts', 'src/__tests__/shared/**/*.test.ts', 'src/__tests__/scripts/**/*.test.ts'],
					exclude: ['release/**', 'node_modules/**']
				}
			}
		]
	}
});
