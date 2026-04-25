import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppConfig } from 'model/AppConfig';
import type { AppState, AppStateUpdate } from 'model/AppState';
import type { ModCollection } from 'model/ModCollection';
import { SessionMods } from 'model/SessionMods';
import { DEFAULT_CONFIG } from 'renderer/Constants';

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

export type AppAction =
	| {
			type: 'merge';
			payload: AppStateUpdate;
	  }
	| {
			type: 'set-config';
			payload: AppConfig;
	  }
	| {
			type: 'set-collections';
			payload: {
				allCollections: Map<string, ModCollection>;
				allCollectionNames: Set<string>;
				activeCollection?: ModCollection;
			};
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

export const setAppConfig = (payload: AppConfig): AppAction => ({
	type: 'set-config',
	payload
});

export const setCollectionsState = (
	allCollections: Map<string, ModCollection>,
	allCollectionNames: Set<string>,
	activeCollection?: ModCollection
): AppAction => ({
	type: 'set-collections',
	payload: {
		allCollections,
		allCollectionNames,
		activeCollection
	}
});

export const setActiveCollection = (payload?: ModCollection): AppAction => ({
	type: 'set-active-collection',
	payload
});

export const setModsState = (payload: SessionMods): AppAction => ({
	type: 'set-mods',
	payload
});

function createInitialAppState(): AppStateData {
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
		case 'set-config':
			if (state.config === action.payload) {
				return state;
			}
			return {
				...state,
				config: action.payload
			};
		case 'set-collections':
			return {
				...state,
				allCollections: action.payload.allCollections,
				allCollectionNames: action.payload.allCollectionNames,
				activeCollection: action.payload.activeCollection
			};
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

type AppStateStoreApi = StoreApi<AppStateStore>;

function createAppStateStore(navigate: (path: string) => void) {
	return createStore<AppStateStore>()((set) => {
		const dispatch: React.Dispatch<AppAction> = (action) => {
			set((state) => appReducer(state, action) as AppStateStore);
		};
		const updateState: AppState['updateState'] = (props) => {
			dispatch(mergeAppState(props));
		};

		return {
			...createInitialAppState(),
			navigate,
			updateState,
			dispatch
		};
	});
}

const AppStateStoreContext = createContext<AppStateStoreApi | null>(null);

export function AppStateProvider({ children, navigate }: PropsWithChildren<{ navigate: (path: string) => void }>) {
	const [store] = useState(() => createAppStateStore(navigate));

	useEffect(() => {
		store.setState({ navigate });
	}, [navigate, store]);

	return <AppStateStoreContext.Provider value={store}>{children}</AppStateStoreContext.Provider>;
}

function useAppStateStore() {
	const store = useContext(AppStateStoreContext);
	if (!store) {
		throw new Error('useAppState must be used within AppStateProvider');
	}

	return store;
}

export function useAppStateSelector<T>(selector: (state: AppState) => T) {
	return useStore(useAppStateStore(), selector);
}

export function useAppDispatch() {
	return useStore(useAppStateStore(), (state) => state.dispatch);
}
