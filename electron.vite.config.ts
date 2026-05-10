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
			emptyOutDir: false,
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
			emptyOutDir: false,
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
			emptyOutDir: false,
			rollupOptions: {
				input: resolvePath('src/renderer/index.html')
			}
		}
	}
});
