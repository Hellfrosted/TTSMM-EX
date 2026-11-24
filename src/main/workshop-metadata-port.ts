import { Context, Effect, Layer } from 'effect';
import { getRawWorkshopDetailsForList } from './mod-workshop-metadata';
import type { SteamUGCDetails } from './steamworks';
import type { WorkshopMetadataLookupFailure } from './workshop-errors';

/**
 * Application-owned port for the job "look up Workshop metadata by ID".
 * Core code depends on this named interface; Steamworks stays in the adapter.
 */
export class WorkshopMetadataPort extends Context.Service<
	WorkshopMetadataPort,
	{
		readonly getDetails: (workshopIDs: bigint[]) => Effect.Effect<SteamUGCDetails[], WorkshopMetadataLookupFailure>;
	}
>()('ttsmm/WorkshopMetadataPort') {}

/** Adapter layer: the only place that knows about Steamworks. */
export const WorkshopMetadataPortLive = Layer.succeed(WorkshopMetadataPort)({
	getDetails: getRawWorkshopDetailsForList
});

/** Program shape: requirements stay visible until a Layer supplies them. */
export const getWorkshopMetadata = Effect.fnUntraced(function* (
	workshopIDs: bigint[]
): Effect.fn.Return<SteamUGCDetails[], WorkshopMetadataLookupFailure, WorkshopMetadataPort> {
	const port = yield* WorkshopMetadataPort;
	return yield* port.getDetails(workshopIDs);
});
