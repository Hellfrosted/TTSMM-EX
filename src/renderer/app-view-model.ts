import type { AppState } from 'model';
import type { CollectionWorkspaceAppState } from './state/app-state';

export interface AppShellInputs {
	activeCollection?: AppState['activeCollection'];
	configErrorCount: number;
	launchingGame: boolean;
	loadingMods: boolean;
	madeConfigEdits: boolean;
	pathname: string;
	savingConfig: boolean;
	sidebarCollapsed: boolean;
}

export function createCollectionStageAppState(
	state: Pick<
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
	>
): CollectionWorkspaceAppState {
	return {
		activeCollection: state.activeCollection,
		allCollectionNames: state.allCollectionNames,
		allCollections: state.allCollections,
		config: state.config,
		forceReloadMods: state.forceReloadMods,
		launchingGame: state.launchingGame,
		loadingMods: state.loadingMods,
		mods: state.mods,
		updateState: state.updateState
	};
}

export function createSettingsStageAppState(
	state: Pick<AppState, 'config' | 'configErrors' | 'madeConfigEdits' | 'savingConfig' | 'updateState'>
) {
	return {
		config: state.config,
		configErrors: state.configErrors,
		madeConfigEdits: state.madeConfigEdits,
		savingConfig: state.savingConfig,
		updateState: state.updateState
	};
}

export function createBlockLookupStageAppState(state: Pick<AppState, 'config' | 'mods' | 'updateState'>) {
	return {
		config: state.config,
		mods: state.mods,
		updateState: state.updateState
	};
}

export function createAppShellViewModel(inputs: AppShellInputs) {
	const isLoadingRoute = inputs.pathname.includes('/loading');
	const isSettingsRoute = inputs.pathname.startsWith('/settings');
	const isBlockLookupRoute = inputs.pathname.startsWith('/block-lookup');
	const showCollections = !isLoadingRoute && !isSettingsRoute && !isBlockLookupRoute;
	const showSettings = !isLoadingRoute && isSettingsRoute;
	const showBlockLookup = !isLoadingRoute && isBlockLookupRoute;

	return {
		disableNavigation:
			inputs.launchingGame ||
			isLoadingRoute ||
			inputs.savingConfig ||
			inputs.madeConfigEdits ||
			inputs.configErrorCount > 0,
		hasCollectionWorkspace: !!inputs.activeCollection || !!inputs.loadingMods,
		isBlockLookupRoute,
		isLoadingRoute,
		isSettingsRoute,
		showBlockLookup,
		showCollections,
		showSettings,
		sidebarCollapsed: inputs.sidebarCollapsed
	};
}
