export type StoredViewPath = '/settings' | '/collections/main' | '/block-lookup';

export function getStoredViewPath(currentPath: string | undefined): StoredViewPath {
	if (currentPath?.startsWith('/settings')) {
		return '/settings';
	}

	if (currentPath?.startsWith('/block-lookup')) {
		return '/block-lookup';
	}

	return '/collections/main';
}
