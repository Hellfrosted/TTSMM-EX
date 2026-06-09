import { bench, describe } from 'vitest';
import { collectionNamesEqual, isValidCollectionName, validateCollectionName } from '../shared/collection-name';
import { compactConfiguredOrder, compactRecord, defaultEquivalentOrder, isFiniteNumber, normalizedOrder } from '../shared/view-config';
import { getWorkshopDependencySnapshotState, WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS } from '../shared/workshop-dependency-snapshot';

// Representative workloads modelled on the data the renderer churns through:
// validating user-entered collection names, normalizing persisted view
// configuration, and classifying Workshop dependency snapshots.

const collectionNames = [
	'Default',
	'My Favourite Mods',
	'   ',
	'.',
	'..',
	'CON.txt',
	'COM1.profile',
	'campaign/run',
	'invalid\\path',
	'A reasonably long but otherwise perfectly valid collection name 123',
	'trailing space ',
	'ends with dot.',
	'Console.txt',
	'nul.json'
];

describe('collection-name', () => {
	bench('validateCollectionName over a mixed batch', () => {
		for (const name of collectionNames) {
			validateCollectionName(name);
		}
	});

	bench('isValidCollectionName over a mixed batch', () => {
		for (const name of collectionNames) {
			isValidCollectionName(name);
		}
	});

	bench('collectionNamesEqual case-insensitive comparison', () => {
		for (let index = 0; index < collectionNames.length - 1; index += 1) {
			collectionNamesEqual(collectionNames[index], collectionNames[index + 1]);
		}
	});
});

const defaultOrder = ['type', 'name', 'authors', 'state', 'id', 'size', 'lastUpdate', 'dateAdded', 'tags'] as const;
const configuredOrder = ['tags', 'name', 'unknown-column', 'tags', 'state', 'id'];
const widthRecord: Record<string, unknown> = {
	type: 56,
	name: 288,
	authors: 'not-a-number',
	state: Number.NaN,
	id: 96,
	size: 64,
	tags: 128,
	'unknown-column': 200
};
const validKeys = new Set<string>(defaultOrder);

describe('view-config', () => {
	bench('compactConfiguredOrder dedupes and filters', () => {
		compactConfiguredOrder(configuredOrder, defaultOrder);
	});

	bench('normalizedOrder fills in missing columns', () => {
		normalizedOrder(configuredOrder, defaultOrder);
	});

	bench('compactRecord prunes invalid entries', () => {
		compactRecord(widthRecord, validKeys, isFiniteNumber);
	});

	bench('defaultEquivalentOrder comparison', () => {
		defaultEquivalentOrder([...defaultOrder], defaultOrder);
	});
});

const now = new Date('2026-05-04T12:00:00Z').getTime();
const freshFetchedAt = now - 1_000;
const staleFetchedAt = now - WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS;
const largeDependencies = Array.from({ length: 512 }, (_, index) => BigInt(1_000_000 + index));

const snapshotInputs = [
	{},
	{ steamDependenciesFetchedAt: freshFetchedAt },
	{ steamDependenciesFetchedAt: staleFetchedAt },
	{ steamDependencies: [], steamDependenciesFetchedAt: freshFetchedAt },
	{ steamDependencies: [BigInt(11)], steamDependenciesFetchedAt: freshFetchedAt },
	{ steamDependencies: largeDependencies, steamDependenciesFetchedAt: staleFetchedAt }
];

describe('workshop-dependency-snapshot', () => {
	bench('getWorkshopDependencySnapshotState across snapshot kinds', () => {
		for (const input of snapshotInputs) {
			getWorkshopDependencySnapshotState(input, now);
		}
	});

	bench('getWorkshopDependencySnapshotState on a large known snapshot', () => {
		getWorkshopDependencySnapshotState({ steamDependencies: largeDependencies, steamDependenciesFetchedAt: freshFetchedAt }, now);
	});
});
