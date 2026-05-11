import { type RenderOptions, render } from '@testing-library/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { vi } from 'vitest';
import { type AppConfig, type AppState, SessionMods } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';

export function createTestWrapper() {
	return function TestWrapper({ children }: PropsWithChildren) {
		return children;
	};
}

export function renderWithTestProviders(ui: ReactElement, options?: RenderOptions & { providerState?: unknown }) {
	const { providerState: _providerState, wrapper, ...renderOptions } = options ?? {};

	return {
		...render(ui, {
			wrapper: wrapper ?? createTestWrapper(),
			...renderOptions
		})
	};
}

export function renderInAppRoot(ui: ReactElement) {
	const appRoot = document.createElement('div');
	appRoot.className = 'AppRoot';
	document.body.appendChild(appRoot);
	return render(ui, { container: appRoot });
}

export function createDataTransfer() {
	const data = new Map<string, string>();
	return {
		effectAllowed: '',
		dropEffect: '',
		setData: vi.fn((type: string, value: string) => {
			data.set(type, value);
		}),
		getData: vi.fn((type: string) => data.get(type) || '')
	};
}

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
	return {
		...DEFAULT_CONFIG,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map(),
		...overrides
	};
}

export function createAppState(overrides: Partial<AppState> = {}): AppState {
	const state: AppState = {
		config: createTestConfig(),
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
