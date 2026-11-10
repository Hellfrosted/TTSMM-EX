import { describe, expect, it } from 'vitest';
import { createAppShellViewModel, getAppRouteKind } from '../../renderer/app-view-model';

describe('app-view-model', () => {
	it('classifies only app route prefixes as staged routes', () => {
		expect(getAppRouteKind('/loading/steamworks')).toBe('loading');
		expect(getAppRouteKind('/settings')).toBe('settings');
		expect(getAppRouteKind('/population-pool')).toBe('population-pool');
		expect(getAppRouteKind('/block-lookup')).toBe('block-lookup');
		expect(getAppRouteKind('/collections/loading-history')).toBe('collections');
		expect(getAppRouteKind('/settings-extra')).toBe('collections');
		expect(getAppRouteKind('block-lookup/details')).toBe('block-lookup');
	});

	it('derives app shell route state and navigation disabled state', () => {
		expect(
			createAppShellViewModel({
				activeCollection: undefined,
				configErrorCount: 1,
				launchingGame: false,
				loadingMods: true,
				madeConfigEdits: false,
				pathname: '/settings',
				savingConfig: false
			})
		).toMatchObject({
			disableNavigation: true,
			hasCollectionWorkspace: true,
			isSettingsRoute: true,
			showSettings: true,
			showCollections: false
		});

		expect(
			createAppShellViewModel({
				activeCollection: undefined,
				configErrorCount: 0,
				launchingGame: false,
				loadingMods: false,
				madeConfigEdits: false,
				pathname: '/population-pool',
				savingConfig: false
			})
		).toMatchObject({
			isPopulationPoolRoute: true,
			showPopulationPool: true,
			showCollections: false
		});
	});
});
