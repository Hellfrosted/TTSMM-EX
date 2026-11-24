import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { EResult } from '../../main/steamworks/types';
import { WorkshopMetadataLookupFailure } from '../../main/workshop-errors';
import { getWorkshopMetadata, WorkshopMetadataPort, WorkshopMetadataPortLive } from '../../main/workshop-metadata-port';
import { createWorkshopDetails } from './test-utils';

describe('WorkshopMetadataPort', () => {
	it('keeps the lookup failure in the typed error channel', async () => {
		const failure = new WorkshopMetadataLookupFailure([BigInt(77)], new Error('offline'));
		const port = Layer.succeed(WorkshopMetadataPort)({
			getDetails: () => Effect.fail(failure)
		});

		await expect(Effect.runPromise(getWorkshopMetadata([BigInt(77)]).pipe(Effect.provide(port)))).rejects.toBe(failure);
	});

	it('returns adapter details through the service', async () => {
		const getDetails = vi.fn(() => Effect.succeed([createWorkshopDetails({ publishedFileId: BigInt(77), title: 'Mod' })]));
		const port = Layer.succeed(WorkshopMetadataPort)({ getDetails });

		const details = await Effect.runPromise(getWorkshopMetadata([BigInt(77)]).pipe(Effect.provide(port)));

		expect(getDetails).toHaveBeenCalledWith([BigInt(77)]);
		expect(details).toMatchObject([{ publishedFileId: BigInt(77), title: 'Mod', result: EResult.k_EResultOK }]);
	});

	it('provides a real Steamworks-backed adapter layer', () => {
		expect(WorkshopMetadataPortLive).toBeDefined();
	});
});
