export const WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS = 10 * 60 * 1000;
const WORKSHOP_DEPENDENCY_LOOKUP_STALE_THRESHOLD_MS = WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS;

export function isWorkshopDependencyLookupStale(fetchedAt: number | undefined, now = Date.now()) {
	if (fetchedAt === undefined) {
		return true;
	}

	return now - fetchedAt >= WORKSHOP_DEPENDENCY_LOOKUP_STALE_THRESHOLD_MS;
}
