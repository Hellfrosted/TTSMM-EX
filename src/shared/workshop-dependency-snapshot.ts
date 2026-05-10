export const WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const WORKSHOP_DEPENDENCY_SNAPSHOT_STALE_THRESHOLD_MS = WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS;

export type WorkshopDependencyRefreshResult = { status: 'updated' | 'unknown' | 'failed' };

export function isWorkshopDependencySnapshotStale(fetchedAt: number | undefined, now = Date.now()) {
	if (fetchedAt === undefined) {
		return true;
	}

	return now - fetchedAt >= WORKSHOP_DEPENDENCY_SNAPSHOT_STALE_THRESHOLD_MS;
}
