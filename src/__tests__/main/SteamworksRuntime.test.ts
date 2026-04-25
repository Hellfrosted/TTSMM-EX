import { describe, expect, it, vi } from 'vitest';
import { STEAMWORKS_BYPASS_ENV, SteamworksRuntime, isSteamworksBypassEnabled } from '../../main/steamworks-runtime';

describe('SteamworksRuntime', () => {
	it('only bypasses Steamworks when explicitly requested', () => {
		expect(isSteamworksBypassEnabled({})).toBe(false);
		expect(isSteamworksBypassEnabled({ [STEAMWORKS_BYPASS_ENV]: '1' })).toBe(true);
		expect(isSteamworksBypassEnabled({ [STEAMWORKS_BYPASS_ENV]: 'true' })).toBe(true);
		expect(isSteamworksBypassEnabled({ [STEAMWORKS_BYPASS_ENV]: '0' })).toBe(false);
	});

	it('reports initialized without loading the native Steamworks module when bypassed', () => {
		const logger = {
			warn: vi.fn(),
			error: vi.fn()
		};
		const steamworks = {
			init: vi.fn(() => {
				throw new Error('native module should not be loaded');
			})
		};
		const runtime = new SteamworksRuntime({
			env: { [STEAMWORKS_BYPASS_ENV]: '1' },
			steamworks: steamworks as never,
			logger: logger as never
		});

		expect(runtime.tryInit()).toEqual({ inited: true });
		expect(runtime.getStatus()).toEqual({ inited: true });
		expect(steamworks.init).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it('reports native initialization errors when Steamworks cannot load', () => {
		const logger = {
			warn: vi.fn(),
			error: vi.fn()
		};
		const steamworks = {
			init: vi.fn(() => {
				throw new Error('greenworks unavailable');
			})
		};
		const runtime = new SteamworksRuntime({
			env: {},
			steamworks: steamworks as never,
			logger: logger as never
		});

		expect(runtime.tryInit()).toEqual({
			inited: false,
			error: 'Error: greenworks unavailable'
		});
		expect(steamworks.init).toHaveBeenCalledTimes(1);
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledTimes(1);
	});
});
