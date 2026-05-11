import { createContext, use, useEffect, useState, useSyncExternalStore } from 'react';
import type { PropsWithChildren } from 'react';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { AppState, AppStateUpdate } from 'model/AppState';
import type { ModCollection } from 'model/ModCollection';
import { SessionMods } from 'model/SessionMods';
import { DEFAULT_CONFIG } from 'renderer/Constants';
import { DEFAULT_COLLECTIONS_PATH } from 'shared/app-route-policy';

type AppStateData = Omit<AppState, 'navigate' | 'updateState'>;

export type CollectionWorkspaceAppState = Pick<
	AppState,
	| 'activeCollection'
	| 'allCollectionNames'
	| 'allCollections'
	| 'config'
	| 'forceReloadMods'
	| 'launchingGame'
	| 'loadingMods'
	| 'mods'
	| 'updateState'
>;

type AppAction =
	| {
			type: 'merge';
			payload: AppStateUpdate;
	  }
	| {
			type: 'set-active-collection';
			payload?: ModCollection;
	  }
	| {
			type: 'set-mods';
			payload: SessionMods;
	  };

export const mergeAppState = (payload: AppStateUpdate): AppAction => ({
	type: 'merge',
	payload
});

export const setActiveCollection = (payload?: ModCollection): AppAction => ({
	type: 'set-active-collection',
	payload
});

function createInitialAppState(): AppStateData {
	if (window.electron.uiSmokeMode) {
		const activeCollection: ModCollection = {
			name: 'default',
			mods: []
		};
		const allCollections = new Map<string, ModCollection>([[activeCollection.name, activeCollection]]);
		const allCollectionNames = new Set<string>([activeCollection.name]);

		return {
			config: {
				...DEFAULT_CONFIG,
				activeCollection: activeCollection.name,
				currentPath: DEFAULT_COLLECTIONS_PATH
			},
			userDataPath: '',
			mods: new SessionMods('', []),
			allCollections,
			allCollectionNames,
			activeCollection,
			firstModLoad: true,
			sidebarCollapsed: true,
			launchingGame: false,
			initializedConfigs: true,
			savingConfig: false,
			configErrors: {},
			forceReloadMods: false
		};
	}

	return {
		config: DEFAULT_CONFIG,
		userDataPath: '',
		mods: new SessionMods('', []),
		allCollections: new Map<string, ModCollection>(),
		allCollectionNames: new Set<string>(),
		activeCollection: undefined,
		firstModLoad: false,
		sidebarCollapsed: true,
		launchingGame: false,
		initializedConfigs: false,
		savingConfig: false,
		configErrors: {},
		forceReloadMods: false
	};
}

function mergeStateIfChanged(state: AppStateData, payload: Partial<AppStateData>) {
	const entries = Object.entries(payload) as Array<[keyof AppStateData, AppStateData[keyof AppStateData]]>;
	if (entries.length === 0) {
		return state;
	}

	const hasChanges = entries.some(([key, value]) => state[key] !== value);
	if (!hasChanges) {
		return state;
	}

	return {
		...state,
		...payload
	};
}

export function appReducer(state: AppStateData, action: AppAction): AppStateData {
	switch (action.type) {
		case 'merge':
			return mergeStateIfChanged(state, action.payload);
		case 'set-active-collection':
			if (state.activeCollection === action.payload) {
				return state;
			}
			return {
				...state,
				activeCollection: action.payload
			};
		case 'set-mods':
			if (state.mods === action.payload) {
				return state;
			}
			return {
				...state,
				mods: action.payload
			};
	}
}

interface AppStateStore extends AppState {
	dispatch: React.Dispatch<AppAction>;
}

type AppStateStoreApi = AtomRef.AtomRef<AppStateStore>;

function createAppStateStore(navigate: (path: string) => void): AppStateStoreApi {
	let storeRef: AppStateStoreApi;
	const dispatch: React.Dispatch<AppAction> = (action) => {
		storeRef.update((state) => appReducer(state, action) as AppStateStore);
	};
	const updateState: AppState['updateState'] = (props) => {
		dispatch(mergeAppState(props));
	};

	storeRef = AtomRef.make({
		...createInitialAppState(),
		navigate,
		updateState,
		dispatch
	});
	return storeRef;
}

const AppStateStoreContext = createContext<AppStateStoreApi | null>(null);

export function AppStateProvider({ children, navigate }: PropsWithChildren<{ navigate: (path: string) => void }>) {
	const [store] = useState(() => createAppStateStore(navigate));

	useEffect(() => {
		store.update((state) => (state.navigate === navigate ? state : { ...state, navigate }));
	}, [navigate, store]);

	return <AppStateStoreContext.Provider value={store}>{children}</AppStateStoreContext.Provider>;
}

function useAppStateStore() {
	const store = use(AppStateStoreContext);
	if (!store) {
		throw new Error('useAppState must be used within AppStateProvider');
	}

	return store;
}

export function useAppStateSelector<T>(selector: (state: AppState) => T) {
	const store = useAppStateStore();
	return useSyncExternalStore(
		(onStoreChange) => store.subscribe(onStoreChange),
		() => selector(store.value),
		() => selector(store.value)
	);
}
