// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMainConfig, createPreloadConfig, createRendererConfig } from '../../../vite.config';
import vitestConfig from '../../../vitest.config';

const normalizePath = (value: unknown) => String(value).replaceAll('\\', '/');

type ExternalPredicate = (id: string) => boolean | null | void;
type ManualChunks = (
	id: string,
	meta: {
		getModuleIds: () => IterableIterator<string>;
		getModuleInfo: () => null;
	}
) => string | undefined;
type RollupOptionsLike = {
	external?: unknown;
	output?:
		| {
				manualChunks?: unknown;
		  }
		| Array<{
				manualChunks?: unknown;
		  }>;
};

const manualChunkMeta = {
	getModuleIds: function* getModuleIds() {},
	getModuleInfo: () => null
};
const expectedAliasKeys = ['model', 'model/*', 'renderer/*', 'shared/*', 'util/*'];
const expectedVitestAliasKeys = [
	'electron/common',
	'electron/main',
	'electron/renderer',
	'model',
	'renderer/*',
	'shared/*',
	'util/*'
].sort();

function readJsonFile<T>(relativePath: string): T {
	const jsonc = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/^\s*\/\/.*$/gm, '');
	return JSON.parse(jsonc) as T;
}

function getExternalPredicate(rollupOptions: RollupOptionsLike | undefined) {
	const external = rollupOptions?.external;
	if (typeof external !== 'function') {
		throw new TypeError('Expected Vite config to expose a Rollup external predicate.');
	}
	return external as ExternalPredicate;
}

function getManualChunks(rollupOptions: RollupOptionsLike | undefined) {
	const output = rollupOptions?.output;
	const manualChunks = Array.isArray(output) ? output[0]?.manualChunks : output?.manualChunks;
	if (typeof manualChunks !== 'function') {
		throw new TypeError('Expected renderer config to expose a manualChunks function.');
	}
	return manualChunks as ManualChunks;
}

function getViteAliasKeys(alias: unknown) {
	if (!Array.isArray(alias)) {
		throw new TypeError('Expected Vite config to expose an alias array.');
	}

	return alias
		.map((entry) => {
			const find = (entry as { find?: unknown }).find;
			if (!(find instanceof RegExp)) {
				throw new TypeError('Expected Vite alias entries to use RegExp find patterns.');
			}
			if (find.source === '^model$') {
				return 'model';
			}
			const prefixMatch = /^\^(.+)\\\/$/.exec(find.source);
			if (!prefixMatch) {
				throw new Error(`Unexpected Vite alias pattern: ${find.source}`);
			}
			return `${prefixMatch[1]}/*`;
		})
		.sort();
}

function getObjectAliasKeys(alias: unknown) {
	if (!alias || Array.isArray(alias) || typeof alias !== 'object') {
		throw new TypeError('Expected config to expose an alias object.');
	}

	return Object.keys(alias).sort();
}

function getVitestAliasKeys(alias: unknown) {
	return getObjectAliasKeys(alias)
		.map((key) => (['renderer', 'shared', 'util'].includes(key) ? `${key}/*` : key))
		.sort();
}

describe('vite config', () => {
	it('builds main and preload as CommonJS SSR entries for Electron', () => {
		const mainConfig = createMainConfig();
		const preloadConfig = createPreloadConfig();

		expect(mainConfig.build?.ssr).toBe(true);
		expect(preloadConfig.build?.ssr).toBe(true);
		expect(mainConfig.build?.target).toBe('node20');
		expect(preloadConfig.build?.target).toBe('node20');
		expect(normalizePath(mainConfig.build?.outDir)).toBe('release/app/dist/main');
		expect(normalizePath(preloadConfig.build?.outDir)).toBe('release/app/dist/preload');
		expect(normalizePath((mainConfig.build?.rollupOptions?.input as { main: string }).main)).toContain('/src/main/main.ts');
		expect(normalizePath((preloadConfig.build?.rollupOptions?.input as { preload: string }).preload)).toContain('/src/main/preload.ts');
		expect(mainConfig.build?.rollupOptions?.output).toMatchObject({ format: 'cjs', entryFileNames: '[name].js' });
		expect(preloadConfig.build?.rollupOptions?.output).toMatchObject({ format: 'cjs', entryFileNames: '[name].js' });
	});

	it('externalizes Electron, Node builtins, and release app dependencies from main bundles', () => {
		const mainExternal = getExternalPredicate(createMainConfig().build?.rollupOptions);
		const preloadExternal = getExternalPredicate(createPreloadConfig().build?.rollupOptions);

		for (const isExternal of [mainExternal, preloadExternal]) {
			expect(isExternal('electron')).toBe(true);
			expect(isExternal('fs')).toBe(true);
			expect(isExternal('node:path')).toBe(true);
			expect(isExternal('ps-list')).toBe(true);
			expect(isExternal('greenworks')).toBe(true);
			expect(isExternal('effect')).toBe(true);
			expect(isExternal('@effect/platform-node')).toBe(true);
		}
	});

	it('keeps renderer output and vendor chunks stable', () => {
		const rendererConfig = createRendererConfig(false);
		const manualChunks = getManualChunks(rendererConfig.build?.rollupOptions);

		expect(normalizePath(rendererConfig.root)).toContain('/src/renderer');
		expect(rendererConfig.server).toMatchObject({ port: 1212, strictPort: true });
		expect(rendererConfig.build?.modulePreload).toBe(false);
		expect(normalizePath(rendererConfig.build?.outDir)).toContain('/release/app/dist/renderer');
		expect(normalizePath(rendererConfig.build?.rollupOptions?.input)).toContain('/src/renderer/index.html');
		const reactChunk = manualChunks('/repo/node_modules/react/index.js', manualChunkMeta);
		const routerChunk = manualChunks('/repo/node_modules/react-router-dom/dist/index.js', manualChunkMeta);
		const dataChunk = manualChunks('/repo/node_modules/effect/dist/esm/index.js', manualChunkMeta);

		expect(reactChunk).toBeDefined();
		expect(routerChunk).toBe(reactChunk);
		expect(dataChunk).toBeDefined();
		expect(dataChunk).not.toBe(reactChunk);
		expect(manualChunks('/repo/src/renderer/App.tsx', manualChunkMeta)).toBeUndefined();
	});

	it('keeps path aliases aligned across TypeScript, Vite, Vitest, and Fallow', () => {
		const tsconfig = readJsonFile<{ compilerOptions?: { paths?: Record<string, string[]> } }>('tsconfig.base.json');
		const fallow = readJsonFile<{ entry?: string[]; paths?: unknown }>('.fallowrc.json');
		const importedVitestConfig = vitestConfig as { resolve?: { alias?: unknown } };

		expect(Object.keys(tsconfig.compilerOptions?.paths ?? {}).sort()).toEqual(expectedAliasKeys);
		expect(fallow.paths).toBeUndefined();
		expect(fallow.entry).toContain('src/main/main.ts');
		expect(fallow.entry).toContain('src/main/preload.ts');
		expect(getVitestAliasKeys(importedVitestConfig.resolve?.alias)).toEqual(expectedVitestAliasKeys);
		expect(getViteAliasKeys(createRendererConfig(false).resolve?.alias)).toEqual(expectedAliasKeys);
		expect(createRendererConfig(false).resolve?.alias).toEqual(createMainConfig().resolve?.alias);
		expect(createRendererConfig(false).resolve?.alias).toEqual(createPreloadConfig().resolve?.alias);
	});
});
