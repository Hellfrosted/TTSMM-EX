// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createMainConfig, createPreloadConfig, createRendererConfig } from '../../../vite.config';

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
			expect(isExternal('axios')).toBe(false);
			expect(isExternal('@tanstack/react-query')).toBe(false);
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
		expect(manualChunks('/repo/node_modules/react/index.js', manualChunkMeta)).toBe('vendor-react');
		expect(manualChunks('/repo/node_modules/react-router-dom/dist/index.js', manualChunkMeta)).toBe('vendor-react');
		expect(manualChunks('/repo/node_modules/axios/index.js', manualChunkMeta)).toBe('vendor-data');
		expect(manualChunks('/repo/src/renderer/App.tsx', manualChunkMeta)).toBeUndefined();
	});
});
