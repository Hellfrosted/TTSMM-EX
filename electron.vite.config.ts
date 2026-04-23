import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolvePath = (...segments: string[]) => path.resolve(__dirname, ...segments);
const readDependencies = (relativePath: string) => {
	const packageJson = JSON.parse(fs.readFileSync(resolvePath(relativePath), 'utf8')) as {
		dependencies?: Record<string, string>;
	};
	return Object.keys(packageJson.dependencies ?? {});
};

const matchesNodeModulePackage = (id: string, packageName: string) =>
	new RegExp(`[\\\\/]node_modules[\\\\/]${packageName.replaceAll('/', '[\\\\/]')}(?:[\\\\/]|$)`).test(id);

const REACT_PACKAGE_PATTERN = /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)(?:[\\/]|$)/;
const REMIX_ROUTER_PATTERN = /[\\/]node_modules[\\/]@remix-run[\\/]router(?:[\\/]|$)/;
function getRendererManualChunk(id: string) {
	if (!id.includes('node_modules')) {
		return undefined;
	}

	if (REACT_PACKAGE_PATTERN.test(id) || REMIX_ROUTER_PATTERN.test(id)) {
		return 'vendor-react';
	}

	if (
		matchesNodeModulePackage(id, 'axios') ||
		matchesNodeModulePackage(id, 'async-mutex') ||
		matchesNodeModulePackage(id, 'dateformat') ||
		matchesNodeModulePackage(id, 'node-html-parser')
	) {
		return 'vendor-data';
	}

	if (
		matchesNodeModulePackage(id, 'antd') ||
		matchesNodeModulePackage(id, '@ant-design/colors') ||
		matchesNodeModulePackage(id, '@ant-design/cssinjs') ||
		matchesNodeModulePackage(id, '@ant-design/fast-color') ||
		matchesNodeModulePackage(id, '@ant-design/icons') ||
		matchesNodeModulePackage(id, '@ant-design/icons-svg') ||
		/[\\/]node_modules[\\/](rc-[^\\/]+|@rc-component[\\/][^\\/]+)(?:[\\/]|$)/.test(id)
	) {
		return 'vendor-ui';
	}

	return undefined;
}

const releaseAppDependencies = new Set(readDependencies('release/app/package.json'));
const bundledRootDependencies = readDependencies('package.json').filter((dependency) => !releaseAppDependencies.has(dependency));
const rendererPort = Number.parseInt(process.env.PORT || '1212', 10);

const alias = {
	model: resolvePath('src/model'),
	renderer: resolvePath('src/renderer'),
	shared: resolvePath('src/shared'),
	util: resolvePath('src/util')
};

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin({ exclude: bundledRootDependencies })],
		resolve: {
			alias
		},
		build: {
			outDir: 'release/app/dist/main',
			emptyOutDir: true,
			rollupOptions: {
				input: {
					main: resolvePath('src/main/main.ts')
				},
				output: {
					entryFileNames: '[name].js'
				}
			}
		}
	},
	preload: {
		plugins: [externalizeDepsPlugin({ exclude: bundledRootDependencies })],
		resolve: {
			alias
		},
		build: {
			outDir: 'release/app/dist/preload',
			emptyOutDir: true,
			rollupOptions: {
				input: {
					preload: resolvePath('src/main/preload.ts')
				},
				output: {
					entryFileNames: '[name].js'
				}
			}
		}
	},
	renderer: {
		root: resolvePath('src/renderer'),
		resolve: {
			alias
		},
		plugins: react(),
		server: {
			port: Number.isNaN(rendererPort) ? 1212 : rendererPort,
			strictPort: true
		},
		css: {
			preprocessorOptions: {
				less: {
					javascriptEnabled: true
				}
			}
		},
		build: {
			outDir: resolvePath('release/app/dist/renderer'),
			emptyOutDir: true,
			rollupOptions: {
				input: resolvePath('src/renderer/index.html'),
				output: {
					manualChunks: getRendererManualChunk
				}
			}
		}
	}
});
