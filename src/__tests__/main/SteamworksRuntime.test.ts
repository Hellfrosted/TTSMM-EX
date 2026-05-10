import { describe, expect, it, vi } from 'vitest';
import { SteamworksRuntime, classifySteamworksReadiness } from '../../main/steamworks-runtime';
import { EResult, UGCItemState } from '../../main/steamworks/types';
import { refreshWorkshopMetadata, runSteamworksAction } from '../../main/workshop-actions';
import { ModType } from '../../model';

describe('SteamworksRuntime', () => {
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
			error: 'Error: greenworks unavailable',
			readiness: { kind: 'native-module-unavailable', retryable: true }
		});
		expect(steamworks.init).toHaveBeenCalledTimes(1);
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledTimes(1);
	});

	it('classifies stable readiness outcomes from native initialization results', () => {
		expect(classifySteamworksReadiness(true)).toEqual({ kind: 'ready', retryable: false });
		expect(classifySteamworksReadiness(false, 'Error: greenworks unavailable')).toEqual({
			kind: 'native-module-unavailable',
			retryable: true
		});
		expect(classifySteamworksReadiness(false, 'Error: Steam is not running')).toEqual({
			kind: 'steam-not-running',
			retryable: true
		});
		expect(classifySteamworksReadiness(false, "Maybe that's not really YOUR app ID? 285920")).toEqual({
			kind: 'wrong-app-id',
			retryable: false
		});
		expect(classifySteamworksReadiness(false, 'Error: unexpected native failure')).toEqual({
			kind: 'unknown-failure',
			retryable: true
		});
	});

	it('keeps readiness gating and native result handling behind the runtime action runner', async () => {
		const logger = {
			error: vi.fn()
		};
		const action = vi.fn((success: (result: EResult) => void) => {
			success(EResult.k_EResultFail);
		});

		await expect(
			runSteamworksAction({ inited: false, readiness: { kind: 'steam-not-running', retryable: true } }, 'Failed action', action, logger)
		).resolves.toBe(false);
		expect(action).not.toHaveBeenCalled();

		await expect(
			runSteamworksAction({ inited: true, readiness: { kind: 'ready', retryable: false } }, 'Failed action', action, logger)
		).resolves.toBe(false);
		expect(action).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(`Failed action. Status ${EResult.k_EResultFail.toString()}`);
	});

	it('refreshes workshop metadata through an injectable Steamworks adapter', async () => {
		const loadModDetailsFromPath = vi.fn(async (mod) => {
			mod.id = 'BundleId';
			return mod;
		});
		const steamworks = {
			ugcGetItemState: vi.fn(() => UGCItemState.Subscribed | UGCItemState.Installed),
			ugcGetItemInstallInfo: vi.fn(() => ({
				folder: 'C:\\mods\\42',
				sizeOnDisk: '2048',
				timestamp: 1710000000
			}))
		};

		const update = await refreshWorkshopMetadata(
			{
				uid: 'workshop:42',
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'HumanReadableModId',
				name: 'Steam Title'
			},
			{
				loadModDetailsFromPath,
				steamworks: steamworks as never
			}
		);

		expect(steamworks.ugcGetItemState).toHaveBeenCalledWith(BigInt(42));
		expect(loadModDetailsFromPath).toHaveBeenCalledWith(expect.objectContaining({ name: 'Steam Title' }), 'C:\\mods\\42', ModType.WORKSHOP);
		expect(update).toEqual(
			expect.objectContaining({
				id: 'BundleId',
				installed: true,
				path: 'C:\\mods\\42',
				size: 2048,
				subscribed: true
			})
		);
	});
});
