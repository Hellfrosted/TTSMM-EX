import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidGreenworksChannels } from '../../main/steamworks/types';

const mockSteamworks = {
	on: vi.fn(),
	requestUserInformation: vi.fn(),
	getFriendPersonaName: vi.fn()
};

vi.mock('../../main/steamworks', () => ({
	default: mockSteamworks
}));

describe('steam persona resolution', () => {
	let personaStateChangeListener: ((steamID: string) => void) | undefined;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		personaStateChangeListener = undefined;
		mockSteamworks.on.mockImplementation((channel: string, callback: (steamID: string) => void) => {
			if (channel === ValidGreenworksChannels.PERSONA_STATE_CHANGE) {
				personaStateChangeListener = callback;
			}
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves by persona-state-change event and reuses the in-flight promise', async () => {
		mockSteamworks.requestUserInformation.mockReturnValue(true);
		mockSteamworks.getFriendPersonaName.mockReturnValueOnce('').mockReturnValueOnce('').mockReturnValue('Player One');

		const [{ ManagedRuntime }, { SteamPersonaCache, SteamPersonaCacheLive }] = await Promise.all([
			import('effect'),
			import('../../main/steam-persona-cache')
		]);
		const runtime = ManagedRuntime.make(SteamPersonaCacheLive);

		const resolvePersonaName = (steamID: string) => SteamPersonaCache['use']((cache) => cache.resolve(steamID));
		const firstLookup = runtime.runPromise(resolvePersonaName('123'));
		const secondLookup = runtime.runPromise(resolvePersonaName('123'));

		await vi.waitFor(() => {
			expect(mockSteamworks.requestUserInformation).toHaveBeenCalledTimes(1);
			expect(mockSteamworks.on).toHaveBeenCalledTimes(1);
			expect(personaStateChangeListener).toBeDefined();
		});

		personaStateChangeListener?.('123');

		await expect(firstLookup).resolves.toBe('Player One');
		await expect(secondLookup).resolves.toBe('Player One');
	});

	it('falls back to the raw steam id after the timeout', async () => {
		vi.useFakeTimers();
		mockSteamworks.requestUserInformation.mockReturnValue(true);
		mockSteamworks.getFriendPersonaName.mockReturnValue('');

		const [{ ManagedRuntime }, { SteamPersonaCache, SteamPersonaCacheLive }] = await Promise.all([
			import('effect'),
			import('../../main/steam-persona-cache')
		]);
		const runtime = ManagedRuntime.make(SteamPersonaCacheLive);

		const lookup = runtime.runPromise(SteamPersonaCache['use']((cache) => cache.resolve('456')));
		await vi.waitFor(() => {
			expect(mockSteamworks.requestUserInformation).toHaveBeenCalledTimes(1);
		});
		vi.advanceTimersByTime(5000);

		await expect(lookup).resolves.toBe('456');
	});
});
