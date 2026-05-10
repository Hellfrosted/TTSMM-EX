import { SessionMods, type AppState } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { vi } from 'vitest';

export function createAppState(overrides: Partial<AppState> = {}): AppState {
	const state: AppState = {
		config: {
			...DEFAULT_CONFIG,
			currentPath: '/collections/main',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		},
		userDataPath: '',
		mods: new SessionMods('', []),
		allCollections: new Map(),
		allCollectionNames: new Set(),
		activeCollection: undefined,
		firstModLoad: false,
		sidebarCollapsed: true,
		launchingGame: false,
		initializedConfigs: false,
		savingConfig: false,
		madeConfigEdits: false,
		configErrors: {},
		loadingMods: false,
		forceReloadMods: false,
		updateState: vi.fn((props: Partial<AppState>) => {
			Object.assign(state, props);
		}),
		navigate: vi.fn(),
		...overrides
	};

	return state;
}
