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

		const { resolvePersonaName } = await import('../../main/steam-persona-cache');

		const firstLookup = resolvePersonaName('123');
		const secondLookup = resolvePersonaName('123');

		expect(firstLookup).toBe(secondLookup);
		expect(mockSteamworks.requestUserInformation).toHaveBeenCalledTimes(1);
		expect(personaStateChangeListener).toBeDefined();

		personaStateChangeListener?.('123');

		await expect(firstLookup).resolves.toBe('Player One');
	});

	it('falls back to the raw steam id after the timeout', async () => {
		vi.useFakeTimers();
		mockSteamworks.requestUserInformation.mockReturnValue(true);
		mockSteamworks.getFriendPersonaName.mockReturnValue('');

		const { resolvePersonaName } = await import('../../main/steam-persona-cache');

		const lookup = resolvePersonaName('456');
		vi.advanceTimersByTime(5000);

		await expect(lookup).resolves.toBe('456');
	});
});
