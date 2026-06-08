export type AppRouteKind = 'block-lookup' | 'collections' | 'loading' | 'population-pool' | 'settings';
export type StoredViewPath = '/settings' | '/collections/main' | '/population-pool' | '/block-lookup';

export const DEFAULT_COLLECTIONS_PATH: StoredViewPath = '/collections/main';

function normalizePath(currentPath: string | undefined): string {
	if (!currentPath) {
		return DEFAULT_COLLECTIONS_PATH;
	}

	return currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
}

export function getAppRouteKind(pathname: string | undefined): AppRouteKind {
	const normalizedPath = normalizePath(pathname);
	switch (normalizedPath[1]) {
		case 'l':
			return normalizedPath === '/loading' || normalizedPath.startsWith('/loading/') ? 'loading' : 'collections';
		case 's':
			return normalizedPath === '/settings' || normalizedPath.startsWith('/settings/') ? 'settings' : 'collections';
		case 'b':
			return normalizedPath === '/block-lookup' || normalizedPath.startsWith('/block-lookup/') ? 'block-lookup' : 'collections';
		case 'p':
			return normalizedPath === '/population-pool' || normalizedPath.startsWith('/population-pool/') ? 'population-pool' : 'collections';
		default:
			return 'collections';
	}
}

export function getStoredViewPath(currentPath: string | undefined): StoredViewPath {
	switch (getAppRouteKind(currentPath)) {
		case 'settings':
			return '/settings';
		case 'block-lookup':
			return '/block-lookup';
		case 'population-pool':
			return '/population-pool';
		case 'collections':
		case 'loading':
			return DEFAULT_COLLECTIONS_PATH;
	}
}

export function getStartupRestorablePath(currentPath: string | undefined): string {
	const normalizedPath = normalizePath(currentPath);
	if (normalizedPath === '/collections') {
		return DEFAULT_COLLECTIONS_PATH;
	}

	const routeKind = getAppRouteKind(normalizedPath);
	return routeKind === 'collections' || routeKind === 'population-pool' || routeKind === 'block-lookup'
		? getStoredViewPath(normalizedPath)
		: DEFAULT_COLLECTIONS_PATH;
}
