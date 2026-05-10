import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { type InlineConfig, defineConfig, type PluginOption } from 'vite';
import { applyRendererContentSecurityPolicy } from './src/shared/renderer-csp';

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

	return undefined;
}

const releaseAppDependencies = readDependencies('release/app/package.json');
const releaseAppDependencySet = new Set(releaseAppDependencies);
const bundledRootDependencies = readDependencies('package.json').filter((dependency) => !releaseAppDependencySet.has(dependency));
const rendererPort = Number.parseInt(process.env.PORT || '1212', 10);
const nodeBuiltinExternals = new Set([...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)]);
const electronMainExternals = new Set(['electron', ...releaseAppDependencies]);

const alias = [
	{ find: /^model$/, replacement: resolvePath('src/model/index.ts') },
	{ find: /^model\//, replacement: `${resolvePath('src/model')}/` },
	{ find: /^renderer\//, replacement: `${resolvePath('src/renderer')}/` },
	{ find: /^shared\//, replacement: `${resolvePath('src/shared')}/` },
	{ find: /^util\//, replacement: `${resolvePath('src/util')}/` }
];

function isElectronMainExternal(id: string) {
	if (nodeBuiltinExternals.has(id)) {
		return true;
	}

	const [packageNameOrScope, scopedPackageName] = id.split('/');
	const packageName = packageNameOrScope?.startsWith('@') ? `${packageNameOrScope}/${scopedPackageName}` : packageNameOrScope;
	return Boolean(packageName && electronMainExternals.has(packageName));
}

function rendererContentSecurityPolicyPlugin(isDevelopment: boolean): PluginOption {
	return {
		name: 'ttsmm-renderer-csp',
		transformIndexHtml(html) {
			return applyRendererContentSecurityPolicy(html, { isDevelopment });
		}
	};
}

const mainPreloadBaseConfig = {
	configFile: false,
	publicDir: false,
	resolve: {
		alias
	},
	ssr: {
		noExternal: bundledRootDependencies
	}
} satisfies InlineConfig;

export function createMainConfig(): InlineConfig {
	return {
		...mainPreloadBaseConfig,
		build: {
			ssr: true,
			target: 'node20',
			outDir: 'release/app/dist/main',
			emptyOutDir: true,
			rollupOptions: {
				external: isElectronMainExternal,
				input: {
					main: resolvePath('src/main/main.ts')
				},
				output: {
					format: 'cjs',
					entryFileNames: '[name].js'
				}
			}
		}
	};
}

export function createPreloadConfig(): InlineConfig {
	return {
		...mainPreloadBaseConfig,
		build: {
			ssr: true,
			target: 'node20',
			outDir: 'release/app/dist/preload',
			emptyOutDir: true,
			rollupOptions: {
				external: isElectronMainExternal,
				input: {
					preload: resolvePath('src/main/preload.ts')
				},
				output: {
					format: 'cjs',
					entryFileNames: '[name].js'
				}
			}
		}
	};
}

export function createRendererConfig(isDevelopment: boolean): InlineConfig {
	return {
		configFile: false,
		root: resolvePath('src/renderer'),
		resolve: {
			alias
		},
		plugins: [rendererContentSecurityPolicyPlugin(isDevelopment), react(), tailwindcss()],
		server: {
			port: Number.isNaN(rendererPort) ? 1212 : rendererPort,
			strictPort: true
		},
		build: {
			outDir: resolvePath('release/app/dist/renderer'),
			emptyOutDir: true,
			// Electron loads the generated HTML directly from disk in production; keep asset loading explicit.
			modulePreload: false,
			rollupOptions: {
				input: resolvePath('src/renderer/index.html'),
				output: {
					manualChunks: getRendererManualChunk
				}
			}
		}
	};
}

export default defineConfig(({ command }) => createRendererConfig(command === 'serve'));
