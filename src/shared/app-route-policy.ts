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
	if (normalizedPath === '/loading' || normalizedPath.startsWith('/loading/')) {
		return 'loading';
	}

	if (normalizedPath === '/settings' || normalizedPath.startsWith('/settings/')) {
		return 'settings';
	}

	if (normalizedPath === '/block-lookup' || normalizedPath.startsWith('/block-lookup/')) {
		return 'block-lookup';
	}

	if (normalizedPath === '/population-pool' || normalizedPath.startsWith('/population-pool/')) {
		return 'population-pool';
	}

	return 'collections';
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
