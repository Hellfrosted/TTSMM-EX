import { describe, expect, it } from 'vitest';
import { normalizeReadModMetadataRequest } from '../../main/ipc/mod-metadata-request';
import { parseReadModMetadataPayload } from '../../main/ipc/mod-validation';
import { ValidChannel } from '../../shared/ipc';

describe('mod metadata request normalization', () => {
	it('normalizes validated metadata payloads into inventory scan facts', () => {
		const payload = parseReadModMetadataPayload(ValidChannel.READ_MOD_METADATA, 'C:\\mods', [
			'workshop:42',
			'local:BundleId',
			'workshop:not-a-number',
			'workshop:0007'
		]);

		const request = normalizeReadModMetadataRequest(payload);

		expect(request).toEqual({
			knownWorkshopMods: [42n, 7n],
			localPath: 'C:\\mods',
			treatNuterraSteamBetaAsEquivalent: undefined
		});
	});

	it('preserves metadata scan options after transport validation', () => {
		const payload = parseReadModMetadataPayload(ValidChannel.READ_MOD_METADATA, undefined, [], true);

		const request = normalizeReadModMetadataRequest(payload);

		expect(request).toEqual({
			knownWorkshopMods: [],
			localPath: undefined,
			treatNuterraSteamBetaAsEquivalent: true
		});
	});
});
