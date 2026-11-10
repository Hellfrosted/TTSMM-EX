import type { AppState } from 'model/AppState';

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

export function createAppShellViewModel(inputs: AppShellInputs) {
	const routeKind = getAppRouteKind(inputs.pathname);
	const isLoadingRoute = routeKind === 'loading';
	const isSettingsRoute = routeKind === 'settings';
	const isBlockLookupRoute = routeKind === 'block-lookup';
	const isPopulationPoolRoute = routeKind === 'population-pool';
	const showCollections = routeKind === 'collections';
	const showSettings = isSettingsRoute;
	const showBlockLookup = isBlockLookupRoute;
	const showPopulationPool = isPopulationPoolRoute;

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
