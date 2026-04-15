export function getStoredViewPath(currentPath: string | undefined): '/settings' | '/collections/main' {
	if (currentPath?.startsWith('/settings')) {
		return '/settings';
	}

	return '/collections/main';
}
