import type { AppState } from 'model/AppState';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

export { getAppRouteKind } from 'shared/app-route-policy';

import { getAppRouteKind } from 'shared/app-route-policy';

interface AppShellInputs {
	activeCollection?: AppState['activeCollection'];
	configErrorCount: number;
	launchingGame: boolean;
	loadingMods: boolean;
	madeConfigEdits: boolean;
	pathname: string;
	savingConfig: boolean;
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

export function createPopulationPoolStageAppState(state: Pick<AppState, 'config' | 'updateState'>) {
	return {
		config: state.config,
		updateState: state.updateState
	};
}

export function createAppShellViewModel(inputs: AppShellInputs) {
	const routeKind = getAppRouteKind(inputs.pathname);
	const isLoadingRoute = routeKind === 'loading';
	const isSettingsRoute = routeKind === 'settings';
	const isBlockLookupRoute = routeKind === 'block-lookup';
	const isPopulationPoolRoute = routeKind === 'population-pool';
	const showCollections = !isLoadingRoute && !isSettingsRoute && !isBlockLookupRoute && !isPopulationPoolRoute;
	const showSettings = !isLoadingRoute && isSettingsRoute;
	const showBlockLookup = !isLoadingRoute && isBlockLookupRoute;
	const showPopulationPool = !isLoadingRoute && isPopulationPoolRoute;

	return {
		disableNavigation:
			inputs.launchingGame || isLoadingRoute || inputs.savingConfig || inputs.madeConfigEdits || inputs.configErrorCount > 0,
		hasCollectionWorkspace: showCollections || !!inputs.activeCollection || !!inputs.loadingMods,
		isBlockLookupRoute,
		isLoadingRoute,
		isPopulationPoolRoute,
		isSettingsRoute,
		showBlockLookup,
		showCollections,
		showPopulationPool,
		showSettings
	};
}
