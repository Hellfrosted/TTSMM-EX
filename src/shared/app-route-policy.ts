const collections = '/collections';
const loading = '/loading';

export const APP_ROUTES = {
	collections,
	collectionMain: `${collections}/main`,
	settings: '/settings',
	populationPool: '/population-pool',
	blockLookup: '/block-lookup',
	loading,
	loadingConfig: `${loading}/config`,
	loadingSteamworks: `${loading}/steamworks`
} as const;

export type AppRouteKind = 'block-lookup' | 'collections' | 'loading' | 'population-pool' | 'settings';
export type StoredViewPath =
	| typeof APP_ROUTES.settings
	| typeof APP_ROUTES.collectionMain
	| typeof APP_ROUTES.populationPool
	| typeof APP_ROUTES.blockLookup;

export const DEFAULT_COLLECTIONS_PATH: StoredViewPath = APP_ROUTES.collectionMain;

const routePolicies = [
	{ kind: 'loading', prefix: APP_ROUTES.loading, storedPath: DEFAULT_COLLECTIONS_PATH, restoreOnStartup: false },
	{ kind: 'settings', prefix: APP_ROUTES.settings, storedPath: APP_ROUTES.settings, restoreOnStartup: false },
	{ kind: 'block-lookup', prefix: APP_ROUTES.blockLookup, storedPath: APP_ROUTES.blockLookup, restoreOnStartup: true },
	{ kind: 'population-pool', prefix: APP_ROUTES.populationPool, storedPath: APP_ROUTES.populationPool, restoreOnStartup: true }
] as const;

function getRoutePolicy(pathname: string | undefined) {
	const path = pathname ? (pathname.startsWith('/') ? pathname : `/${pathname}`) : DEFAULT_COLLECTIONS_PATH;
	return routePolicies.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
}

export function getAppRouteKind(pathname: string | undefined): AppRouteKind {
	return getRoutePolicy(pathname)?.kind ?? 'collections';
}

export function getStoredViewPath(currentPath: string | undefined): StoredViewPath {
	return getRoutePolicy(currentPath)?.storedPath ?? DEFAULT_COLLECTIONS_PATH;
}

export function getStartupRestorablePath(currentPath: string | undefined): StoredViewPath {
	const policy = getRoutePolicy(currentPath);
	return policy?.restoreOnStartup ? policy.storedPath : DEFAULT_COLLECTIONS_PATH;
}
