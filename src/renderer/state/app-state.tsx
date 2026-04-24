import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { PropsWithChildren } from 'react';
import { SessionMods } from 'model';
import type { AppConfig, AppState, ModCollection } from 'model';
import { DEFAULT_CONFIG } from 'renderer/Constants';

type AppStateData = Omit<AppState, 'navigate' | 'updateState'>;

export type AppAction =
	| {
			type: 'merge';
			payload: Partial<AppStateData>;
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

export const mergeAppState = (payload: Partial<AppStateData>): AppAction => ({
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
		default:
			return state;
	}
}

const AppStateContext = createContext<AppState | null>(null);
const AppDispatchContext = createContext<React.Dispatch<AppAction> | null>(null);

export function AppStateProvider({ children, navigate }: PropsWithChildren<{ navigate: (path: string) => void }>) {
	const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);

	const updateState = useCallback((props: Parameters<AppState['updateState']>[0]) => {
		dispatch(mergeAppState(props));
	}, []);
	const appState: AppState = useMemo(
		() => ({
			...state,
			navigate,
			updateState
		}),
		[navigate, state, updateState]
	);

	return (
		<AppDispatchContext.Provider value={dispatch}>
			<AppStateContext.Provider value={appState}>{children}</AppStateContext.Provider>
		</AppDispatchContext.Provider>
	);
}

export function useAppState() {
	const context = useContext(AppStateContext);
	if (!context) {
		throw new Error('useAppState must be used within AppStateProvider');
	}

	return context;
}

export function useAppDispatch() {
	const context = useContext(AppDispatchContext);
	if (!context) {
		throw new Error('useAppDispatch must be used within AppStateProvider');
	}

	return context;
}
