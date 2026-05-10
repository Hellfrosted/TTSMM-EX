import type log from 'electron-log';
import type { SteamworksReadiness, SteamworksStatus } from 'shared/ipc';

import Steamworks from './steamworks';

interface SteamworksRuntimeOptions {
	steamworks?: Pick<typeof Steamworks, 'init'>;
	logger?: Pick<typeof log, 'error' | 'warn'>;
}

export function classifySteamworksReadiness(inited: boolean, error?: string): SteamworksReadiness {
	if (inited) {
		return { kind: 'ready', retryable: false };
	}

	const normalizedError = (error || '').toLowerCase();
	if (normalizedError.includes('steam unavailable') || normalizedError.includes('steam is not running')) {
		return { kind: 'steam-not-running', retryable: true };
	}

	if (
		normalizedError.includes('not really your app id') ||
		normalizedError.includes("not really you're app id") ||
		normalizedError.includes('not really your appid')
	) {
		return { kind: 'wrong-app-id', retryable: false };
	}

	if (
		normalizedError.includes('dll') ||
		normalizedError.includes('module') ||
		normalizedError.includes('greenworks') ||
		normalizedError.includes('steamworks')
	) {
		return { kind: 'native-module-unavailable', retryable: true };
	}

	return { kind: 'unknown-failure', retryable: true };
}

export class SteamworksRuntime {
	private readonly steamworks: Pick<typeof Steamworks, 'init'>;

	private readonly logger?: Pick<typeof log, 'error' | 'warn'>;

	private steamworksInited = false;

	private steamworksError: string | undefined;

	constructor({ steamworks = Steamworks, logger }: SteamworksRuntimeOptions = {}) {
		this.steamworks = steamworks;
		this.logger = logger;
	}

	getStatus(): SteamworksStatus {
		return {
			inited: this.steamworksInited,
			error: this.steamworksError,
			readiness: classifySteamworksReadiness(this.steamworksInited, this.steamworksError)
		};
	}

	tryInit(): SteamworksStatus {
		try {
			this.steamworksInited = this.steamworks.init();
			this.steamworksError = undefined;
		} catch (error) {
			this.steamworksInited = false;
			this.steamworksError = (error as Error).toString();
			this.logger?.error(error);
		}
		return this.getStatus();
	}
}
