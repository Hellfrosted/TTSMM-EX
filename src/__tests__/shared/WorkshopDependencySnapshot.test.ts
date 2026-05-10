import { describe, expect, it } from 'vitest';
import {
	getWorkshopDependencySnapshotMetadataUpdate,
	getWorkshopDependencySnapshotState,
	shouldRefreshWorkshopDependencySnapshot,
	WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS
} from '../../shared/workshop-dependency-snapshot';

const now = new Date('2026-05-04T12:00:00Z').getTime();
const freshFetchedAt = now - 1_000;
const staleFetchedAt = now - WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS;

describe('Workshop Dependency Snapshot state', () => {
	it('classifies never-checked metadata separately from unknown metadata', () => {
		expect(getWorkshopDependencySnapshotState({}, now)).toMatchObject({
			kind: 'never-checked',
			hasKnownSnapshot: false,
			isUnknown: false,
			shouldRefresh: true
		});

		expect(getWorkshopDependencySnapshotState({ steamDependenciesFetchedAt: freshFetchedAt }, now)).toMatchObject({
			kind: 'unknown',
			hasKnownSnapshot: false,
			isUnknown: true,
			shouldRefresh: false
		});
	});

	it('classifies known empty snapshots separately from unknown snapshots', () => {
		expect(
			getWorkshopDependencySnapshotState(
				{
					steamDependencies: [],
					steamDependenciesFetchedAt: freshFetchedAt
				},
				now
			)
		).toMatchObject({
			kind: 'known-empty',
			dependencyCount: 0,
			hasKnownSnapshot: true,
			isKnownEmpty: true,
			isUnknown: false,
			shouldRefresh: false
		});
	});

	it('keeps Workshop Dependency Name absence from changing known snapshot state', () => {
		expect(
			getWorkshopDependencySnapshotState(
				{
					steamDependencies: [BigInt(11)],
					steamDependenciesFetchedAt: freshFetchedAt
				},
				now
			)
		).toMatchObject({
			kind: 'known',
			dependencyCount: 1,
			hasKnownSnapshot: true,
			isKnownEmpty: false,
			shouldRefresh: false
		});
	});

	it('marks known and unknown snapshots stale after the TTL', () => {
		expect(
			getWorkshopDependencySnapshotState(
				{
					steamDependencies: [BigInt(11)],
					steamDependenciesFetchedAt: staleFetchedAt
				},
				now
			)
		).toMatchObject({
			kind: 'stale-known',
			hasKnownSnapshot: true,
			isStale: true,
			shouldRefresh: true
		});
		expect(
			getWorkshopDependencySnapshotState(
				{
					steamDependencies: [],
					steamDependenciesFetchedAt: staleFetchedAt
				},
				now
			)
		).toMatchObject({
			kind: 'stale-known-empty',
			hasKnownSnapshot: true,
			isKnownEmpty: true,
			isStale: true,
			shouldRefresh: true
		});
		expect(getWorkshopDependencySnapshotState({ steamDependenciesFetchedAt: staleFetchedAt }, now)).toMatchObject({
			kind: 'stale-unknown',
			hasKnownSnapshot: false,
			isStale: true,
			isUnknown: true,
			shouldRefresh: true
		});
	});

	it('exposes refresh decisions through the state Interface', () => {
		const freshKnown = getWorkshopDependencySnapshotState(
			{
				steamDependencies: [BigInt(11)],
				steamDependenciesFetchedAt: freshFetchedAt
			},
			now
		);
		const staleUnknown = getWorkshopDependencySnapshotState({ steamDependenciesFetchedAt: staleFetchedAt }, now);

		expect(shouldRefreshWorkshopDependencySnapshot(freshKnown)).toBe(false);
		expect(shouldRefreshWorkshopDependencySnapshot(staleUnknown)).toBe(true);
	});

	it('maps updated refresh outcomes to full metadata updates', () => {
		expect(
			getWorkshopDependencySnapshotMetadataUpdate({
				status: 'updated',
				snapshot: {
					steamDependencies: [BigInt(11)],
					steamDependencyNames: {
						'11': 'Harmony (2.2.2)'
					},
					steamDependenciesFetchedAt: freshFetchedAt
				}
			})
		).toEqual({
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony (2.2.2)'
			},
			steamDependenciesFetchedAt: freshFetchedAt
		});
	});

	it('maps unknown refresh outcomes to checked timestamp metadata only', () => {
		expect(
			getWorkshopDependencySnapshotMetadataUpdate({
				status: 'unknown',
				checkedAt: freshFetchedAt
			})
		).toEqual({
			steamDependencies: undefined,
			steamDependencyNames: undefined,
			steamDependenciesFetchedAt: freshFetchedAt
		});
	});

	it('keeps failed refresh outcomes from creating metadata updates', () => {
		expect(
			getWorkshopDependencySnapshotMetadataUpdate({
				status: 'failed'
			})
		).toBeUndefined();
	});
});
