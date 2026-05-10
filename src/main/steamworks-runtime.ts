import type log from 'electron-log';

import Steamworks from './steamworks';

export interface SteamStatus {
	inited: boolean;
	error?: string;
}

export interface SteamworksRuntimeOptions {
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

	getStatus(): SteamStatus {
		if (this.bypassEnabled) {
			if (!this.warnedAboutBypass) {
				this.logger?.warn('Steamworks is bypassed for this development run. Workshop metadata and Steam actions are disabled.');
				this.warnedAboutBypass = true;
			}
			return {
				inited: true
			};
		}

		return {
			inited: this.steamworksInited,
			error: this.steamworksError
		};
	}

	tryInit(): SteamStatus {
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
