import { describe, expect, it, vi } from 'vitest';
import { SessionMods, type AppState } from '../../model';
import {
	createAppShellViewModel,
	createBlockLookupStageAppState,
	createCollectionStageAppState,
	createSettingsStageAppState
} from '../../renderer/app-view-model';

function appState(): AppState {
	return {
		activeCollection: { name: 'default', mods: [] },
		allCollectionNames: new Set(['default']),
		allCollections: new Map([['default', { name: 'default', mods: [] }]]),
		config: {
			closeOnLaunch: false,
			language: 'english',
			gameExec: '/game.exe',
			workshopID: 0n,
			logsDir: '',
			steamMaxConcurrency: 5,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		},
		configErrors: {},
		firstModLoad: false,
		forceReloadMods: false,
		launchingGame: false,
		loadingMods: false,
		madeConfigEdits: false,
		mods: new SessionMods('', []),
		navigate: vi.fn(),
		savingConfig: false,
		sidebarCollapsed: false,
		updateState: vi.fn()
	};
}

describe('app-view-model', () => {
	it('derives app shell route state and navigation disabled state', () => {
		expect(
			createAppShellViewModel({
				activeCollection: undefined,
				configErrorCount: 1,
				launchingGame: false,
				loadingMods: true,
				madeConfigEdits: false,
				pathname: '/settings',
				savingConfig: false,
				sidebarCollapsed: false
			})
		).toMatchObject({
			disableNavigation: true,
			hasCollectionWorkspace: true,
			isSettingsRoute: true,
			showSettings: true,
			showCollections: false
		});
	});

	it('creates route app states with narrow field sets', () => {
		const state = appState();

		expect(createCollectionStageAppState(state)).toMatchObject({
			activeCollection: state.activeCollection,
			config: state.config,
			mods: state.mods
		});
		expect(createSettingsStageAppState(state)).toEqual({
			config: state.config,
			configErrors: state.configErrors,
			madeConfigEdits: false,
			savingConfig: false,
			updateState: state.updateState
		});
		expect(createBlockLookupStageAppState(state)).toEqual({
			config: state.config,
			mods: state.mods,
			updateState: state.updateState
		});
	});
});
