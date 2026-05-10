import type { AppConfig } from 'model/AppConfig';
import { DEFAULT_CONFIG } from './Constants';

interface StartupBootErrorDescription {
	title: string;
	detail: string;
}

export function normalizeStartupPath(currentPath: string | undefined): string {
	if (!currentPath) {
		return '/collections/main';
	}

	const normalizedPath = currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
	if (normalizedPath === '/collections' || normalizedPath.startsWith('/block-lookup') || normalizedPath.startsWith('/settings')) {
		return '/collections/main';
	}

	return normalizedPath;
}

export function shouldAutoDiscoverGameExec(config: AppConfig, hasStoredConfig: boolean, platform: string): boolean {
	if (platform === 'linux') {
		return false;
	}

	const configuredPath = config.gameExec?.trim();
	if (!configuredPath) {
		return true;
	}

	return !hasStoredConfig || configuredPath === DEFAULT_CONFIG.gameExec;
}

export function describeStartupBootError(error: string): StartupBootErrorDescription {
	if (error.includes('Failed to load config file')) {
		return {
			title: 'TTSMM-EX could not read your saved settings.',
			detail: 'Check config.json for invalid JSON or restore a known-good copy, then reopen the app.'
		};
	}

	if (error.includes('Failed to load collection')) {
		return {
			title: 'One of your saved collections could not be opened.',
			detail: 'Fix or remove the broken collection JSON from the app data folder, then start TTSMM-EX again.'
		};
	}

	if (error.includes('Failed to persist repaired active collection')) {
		return {
			title: 'TTSMM-EX could not save which collection should open.',
			detail: 'Check that the app data folder is writable, then retry.'
		};
	}

	if (
		error.includes('Failed to persist the default collection during boot') ||
		error.includes('Failed to persist the default active collection during boot')
	) {
		return {
			title: 'TTSMM-EX could not create the default collection it needs to start.',
			detail: 'Check that the app data folder is writable, then retry.'
		};
	}

	if (error.length > 0) {
		return {
			title: 'Startup stopped because a required app file could not be read or written.',
			detail: 'Review the app data folder and permissions, then try again.'
		};
	}

	return {
		title: 'Startup needs attention.',
		detail: 'Fix the issue below before the app can continue.'
	};
}

export function resolveStartupNavigation(config: AppConfig, configErrors: { [field: string]: string } | undefined) {
	if (configErrors && Object.keys(configErrors).length > 0) {
		return {
			config: {
				...config,
				currentPath: '/settings'
			},
			loadingMods: false,
			path: '/settings'
		};
	}

	const currentPath = normalizeStartupPath(config.currentPath);
	return {
		config: {
			...config,
			currentPath
		},
		loadingMods: true,
		path: currentPath
	};
}
