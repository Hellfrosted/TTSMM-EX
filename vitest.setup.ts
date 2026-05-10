/// <reference types="node" />
import '@testing-library/jest-dom/vitest';
import { TextDecoder, TextEncoder } from 'node:util';
import { beforeEach, vi } from 'vitest';
import { SessionMods } from './src/model';
import type { AppConfig, ModCollection } from './src/model';
import type { SteamworksStatus } from './src/shared/ipc';

const electronLogMock = vi.hoisted(() => {
	const quiet = (..._args: unknown[]) => undefined;
	return {
		transports: {
			file: { level: 'debug' },
			console: { level: 'debug' }
		},
		functions: {
			info: quiet,
			debug: quiet,
			warn: quiet,
			error: quiet,
			silly: quiet,
			verbose: quiet
		},
		info: quiet,
		debug: quiet,
		warn: quiet,
		error: quiet,
		silly: quiet,
		verbose: quiet,
		processMessage: quiet,
		initialize: quiet
	};
});

vi.mock('electron-log', () => ({
	default: electronLogMock
}));

const noop = () => undefined;

function lifecycleSuccess(config: AppConfig, activeCollection: ModCollection, collections: ModCollection[] = [activeCollection]) {
	return {
		ok: true,
		activeCollection,
		collections,
		collectionNames: collections.map((collection) => collection.name),
		config: {
			...config,
			activeCollection: activeCollection.name
		}
	};
}

function steamworksReadyStatus(): SteamworksStatus {
	return {
		inited: true,
		readiness: {
			kind: 'ready',
			retryable: false
		}
	};
}

function createElectronMock() {
	return {
		platform: 'win32',
		log: {
			info: noop,
			debug: noop,
			warn: noop,
			error: noop,
			silly: noop,
			verbose: noop
		},
		close: noop,
		exit: noop,
		updateLogLevel: noop,
		getUserDataPath: vi.fn(async () => ''),
		readConfig: vi.fn(async () => null),
		updateConfig: vi.fn(async (config) => config),
		readCollection: vi.fn(async () => null),
		readCollectionsList: vi.fn(async () => []),
		updateCollection: vi.fn(async () => ({ ok: true })),
		createCollectionLifecycle: vi.fn(async (request) =>
			lifecycleSuccess(request.config, {
				name: request.name,
				mods: request.mods ?? []
			})
		),
		duplicateCollectionLifecycle: vi.fn(async (request) =>
			lifecycleSuccess(request.config, {
				name: request.name,
				mods: request.dirtyCollection?.mods ?? []
			})
		),
		renameCollectionLifecycle: vi.fn(async (request) =>
			lifecycleSuccess(request.config, {
				name: request.name,
				mods: request.dirtyCollection?.mods ?? []
			})
		),
		deleteCollectionLifecycle: vi.fn(async (request) =>
			lifecycleSuccess(request.config, {
				name: 'default',
				mods: []
			})
		),
		switchCollectionLifecycle: vi.fn(async (request) =>
			lifecycleSuccess(request.config, {
				name: request.name,
				mods: []
			})
		),
		resolveStartupCollection: vi.fn(async (request) => {
			const activeCollection: ModCollection = {
				name: request.config.activeCollection || 'default',
				mods: []
			};
			return lifecycleSuccess(request.config, activeCollection);
		}),
		pathExists: vi.fn(async () => true),
		discoverGameExecutable: vi.fn(async () => null),
		selectPath: vi.fn(async () => null),
		readBlockLookupSettings: vi.fn(async () => ({ workshopRoot: '' })),
		saveBlockLookupSettings: vi.fn(async (settings) => settings),
		buildBlockLookupIndex: vi.fn(async () => ({
			settings: { workshopRoot: '' },
			stats: {
				sources: 0,
				scanned: 0,
				skipped: 0,
				removed: 0,
				blocks: 0,
				updatedBlocks: 0,
				builtAt: new Date(0).toISOString()
			}
		})),
		searchBlockLookup: vi.fn(async () => ({ rows: [], stats: null })),
		getBlockLookupStats: vi.fn(async () => null),
		autoDetectBlockLookupWorkshopRoot: vi.fn(async () => null),
		launchGame: vi.fn(async () => true),
		isGameRunning: vi.fn(async () => false),
		readModMetadata: vi.fn(async () => new SessionMods('', [])),
		fetchWorkshopDependencies: vi.fn(async () => true),
		steamworksInited: vi.fn(async () => steamworksReadyStatus()),
		downloadMod: vi.fn(async () => true),
		subscribeMod: vi.fn(async () => true),
		unsubscribeMod: vi.fn(async () => true),
		openModBrowser: noop,
		openModSteam: noop,
		openModContextMenu: noop,
		onProgressChange: vi.fn(() => noop),
		onModMetadataUpdate: vi.fn(() => noop),
		onModRefreshRequested: vi.fn(() => noop),
		onReloadSteamworks: vi.fn(() => noop)
	};
}

Object.defineProperty(globalThis, 'TextEncoder', {
	value: TextEncoder,
	writable: true
});

Object.defineProperty(globalThis, 'TextDecoder', {
	value: TextDecoder,
	writable: true
});

if (typeof window !== 'undefined') {
	const originalGetComputedStyle = window.getComputedStyle.bind(window);

	Object.defineProperty(window, 'getComputedStyle', {
		value: ((element: Element, pseudoElt?: string | null) =>
			originalGetComputedStyle(element, pseudoElt && pseudoElt.length > 0 ? null : (pseudoElt ?? null))) as typeof window.getComputedStyle,
		writable: true,
		configurable: true
	});

	Object.defineProperty(window, 'electron', {
		value: createElectronMock(),
		writable: true,
		configurable: true
	});

	Object.defineProperty(window, 'matchMedia', {
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: noop,
			removeListener: noop,
			addEventListener: noop,
			removeEventListener: noop,
			dispatchEvent: () => false
		})),
		writable: true,
		configurable: true
	});

	beforeEach(() => {
		Object.defineProperty(window, 'electron', {
			value: createElectronMock(),
			writable: true,
			configurable: true
		});
	});
}
