export class WorkshopMetadataLookupFailure extends Error {
	readonly _tag = 'WorkshopMetadataLookupFailure';

	constructor(
		readonly workshopIDs: bigint[],
		readonly cause: unknown
	) {
		super(`Failed to fetch Steam Workshop metadata for ${workshopIDs.length} item${workshopIDs.length === 1 ? '' : 's'}`);
	}
}

export class WorkshopPagingFailure extends Error {
	readonly _tag = 'WorkshopPagingFailure';

	constructor(
		readonly pageNum: number,
		readonly cause: unknown
	) {
		super(`Failed to fetch Steam Workshop subscription page ${pageNum}`);
	}
}

export type WorkshopSteamworksFailure = WorkshopMetadataLookupFailure | WorkshopPagingFailure;
