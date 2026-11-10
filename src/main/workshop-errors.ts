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

export type WorkshopPagingStallReason = 'page-limit' | 'no-progress' | 'timeout';

export class WorkshopPagingStalled extends Error {
	readonly _tag = 'WorkshopPagingStalled';

	constructor(
		readonly pageNum: number,
		readonly reason: WorkshopPagingStallReason
	) {
		super(
			reason === 'timeout'
				? `Steam Workshop subscription page ${pageNum} did not respond within the configured timeout`
				: `Steam Workshop subscription paging stopped at page ${pageNum} without progress (${reason})`
		);
	}
}
