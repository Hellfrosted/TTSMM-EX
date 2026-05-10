export const WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const WORKSHOP_DEPENDENCY_SNAPSHOT_STALE_THRESHOLD_MS = WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS;

export type WorkshopDependencyRefreshResult = { status: 'updated' | 'unknown' | 'failed' };
type WorkshopDependencySnapshotStateKind =
	| 'known'
	| 'known-empty'
	| 'never-checked'
	| 'stale-known'
	| 'stale-known-empty'
	| 'stale-unknown'
	| 'unknown';

export interface WorkshopDependencySnapshotMetadata {
	steamDependencies?: readonly bigint[];
	steamDependencyNames?: Readonly<Record<string, string>>;
	steamDependenciesFetchedAt?: number;
}

export interface KnownWorkshopDependencySnapshotMetadata extends WorkshopDependencySnapshotMetadata {
	steamDependencies: bigint[];
	steamDependencyNames?: Record<string, string>;
	steamDependenciesFetchedAt: number;
}

export type WorkshopDependencySnapshotLookupResult =
	| { status: 'updated'; snapshot: KnownWorkshopDependencySnapshotMetadata }
	| { status: 'unknown'; checkedAt: number }
	| { status: 'failed' };

export interface WorkshopDependencySnapshotState {
	dependencyCount: number;
	fetchedAt?: number;
	hasKnownSnapshot: boolean;
	isKnownEmpty: boolean;
	isStale: boolean;
	isUnknown: boolean;
	kind: WorkshopDependencySnapshotStateKind;
	shouldRefresh: boolean;
}

function isWorkshopDependencySnapshotStale(fetchedAt: number | undefined, now = Date.now()) {
	if (fetchedAt === undefined) {
		return true;
	}

	return now - fetchedAt >= WORKSHOP_DEPENDENCY_SNAPSHOT_STALE_THRESHOLD_MS;
}

export function getWorkshopDependencySnapshotState(
	metadata: WorkshopDependencySnapshotMetadata,
	now = Date.now()
): WorkshopDependencySnapshotState {
	const fetchedAt = metadata.steamDependenciesFetchedAt;
	const dependencies = metadata.steamDependencies;

	if (dependencies !== undefined) {
		const dependencyCount = dependencies.length;
		const isKnownEmpty = dependencyCount === 0;
		const isStale = isWorkshopDependencySnapshotStale(fetchedAt, now);
		const kind: WorkshopDependencySnapshotStateKind = isStale
			? isKnownEmpty
				? 'stale-known-empty'
				: 'stale-known'
			: isKnownEmpty
				? 'known-empty'
				: 'known';

		return {
			dependencyCount,
			fetchedAt,
			hasKnownSnapshot: true,
			isKnownEmpty,
			isStale,
			isUnknown: false,
			kind,
			shouldRefresh: isStale
		};
	}

	if (fetchedAt !== undefined) {
		const isStale = isWorkshopDependencySnapshotStale(fetchedAt, now);
		return {
			dependencyCount: 0,
			fetchedAt,
			hasKnownSnapshot: false,
			isKnownEmpty: false,
			isStale,
			isUnknown: true,
			kind: isStale ? 'stale-unknown' : 'unknown',
			shouldRefresh: isStale
		};
	}

	return {
		dependencyCount: 0,
		hasKnownSnapshot: false,
		isKnownEmpty: false,
		isStale: true,
		isUnknown: false,
		kind: 'never-checked',
		shouldRefresh: true
	};
}

export function shouldRefreshWorkshopDependencySnapshot(state: WorkshopDependencySnapshotState) {
	return state.shouldRefresh;
}

export function getWorkshopDependencySnapshotMetadataUpdate(
	result: WorkshopDependencySnapshotLookupResult
): WorkshopDependencySnapshotMetadata | undefined {
	if (result.status === 'updated') {
		return result.snapshot;
	}
	if (result.status === 'unknown') {
		return createUnknownWorkshopDependencySnapshotMetadata(result.checkedAt);
	}
	return undefined;
}

export function getSteamDependencyNameKey(workshopID: bigint): string {
	return workshopID.toString();
}

export function getSteamDependencyName(
	steamDependencyNames: Readonly<Record<string, string>> | undefined,
	workshopID: bigint
): string | undefined {
	return steamDependencyNames?.[getSteamDependencyNameKey(workshopID)];
}

export function createUnknownWorkshopDependencySnapshotMetadata(now: number): WorkshopDependencySnapshotMetadata {
	return {
		steamDependencies: undefined,
		steamDependencyNames: undefined,
		steamDependenciesFetchedAt: now
	};
}
