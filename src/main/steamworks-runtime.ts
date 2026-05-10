import type log from 'electron-log';
import type { SteamworksReadiness, SteamworksStatus } from 'shared/ipc';

import Steamworks from './steamworks';

interface SteamworksRuntimeOptions {
	env?: NodeJS.ProcessEnv;
	steamworks?: Pick<typeof Steamworks, 'init'>;
	logger?: Pick<typeof log, 'error' | 'warn'>;
}

export const STEAMWORKS_BYPASS_ENV = 'TTSMM_BYPASS_STEAMWORKS';

function isTruthyEnv(value: string | undefined): boolean {
	return value === '1' || value?.toLowerCase() === 'true';
}

export function isSteamworksBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return isTruthyEnv(env[STEAMWORKS_BYPASS_ENV]);
}

export function classifySteamworksReadiness(inited: boolean, error?: string, bypassed = false): SteamworksReadiness {
	if (bypassed) {
		return { kind: 'bypassed', retryable: false };
	}

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
	private readonly bypassEnabled: boolean;

	private readonly steamworks: Pick<typeof Steamworks, 'init'>;

	private readonly logger?: Pick<typeof log, 'error' | 'warn'>;

	private warnedAboutBypass = false;

	private steamworksInited = false;

	private steamworksError: string | undefined;

	constructor({ env = process.env, steamworks = Steamworks, logger }: SteamworksRuntimeOptions = {}) {
		this.bypassEnabled = isSteamworksBypassEnabled(env);
		this.steamworks = steamworks;
		this.logger = logger;
	}

	getStatus(): SteamworksStatus {
		if (this.bypassEnabled) {
			if (!this.warnedAboutBypass) {
				this.logger?.warn('Steamworks is bypassed for this development run. Workshop metadata and Steam actions are disabled.');
				this.warnedAboutBypass = true;
			}
			return {
				inited: true,
				readiness: classifySteamworksReadiness(true, undefined, true)
			};
		}

		return {
			inited: this.steamworksInited,
			error: this.steamworksError,
			readiness: classifySteamworksReadiness(this.steamworksInited, this.steamworksError)
		};
	}

	tryInit(): SteamworksStatus {
		if (this.bypassEnabled) {
			return this.getStatus();
		}

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
