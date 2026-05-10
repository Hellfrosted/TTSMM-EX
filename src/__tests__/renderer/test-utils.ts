import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import React from 'react';
import type { ReactElement, PropsWithChildren } from 'react';
import { SessionMods, type AppConfig, type AppState } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { vi } from 'vitest';

export function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: Infinity,
				retry: false
			}
		}
	});
}

export function createQueryWrapper(queryClient = createTestQueryClient()) {
	return function QueryWrapper({ children }: PropsWithChildren) {
		return React.createElement(QueryClientProvider, { client: queryClient }, children);
	};
}

export function renderWithQueryClient(ui: ReactElement, options?: RenderOptions & { queryClient?: QueryClient }) {
	const queryClient = options?.queryClient ?? createTestQueryClient();
	const { queryClient: _queryClient, wrapper, ...renderOptions } = options ?? {};

	return {
		queryClient,
		...render(ui, {
			wrapper: wrapper ?? createQueryWrapper(queryClient),
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
