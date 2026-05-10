import log from 'electron-log';
import { Effect } from 'effect';
import type {
	KnownWorkshopDependencySnapshotMetadata,
	WorkshopDependencySnapshotLookupResult,
	WorkshopDependencySnapshotMetadata
} from 'shared/workshop-dependency-snapshot';
import {
	createUnknownWorkshopDependencySnapshotMetadata,
	getSteamDependencyNameKey,
	getWorkshopDependencySnapshotMetadataUpdate
} from 'shared/workshop-dependency-snapshot';
import { chunkWorkshopIds, getRawWorkshopDetailsForList } from './mod-workshop-metadata';
import type { SteamUGCDetails } from './steamworks';
import { EResult } from './steamworks/types';

type GetRawWorkshopDetailsForList = (workshopIDs: bigint[]) => Effect.Effect<SteamUGCDetails[], unknown>;

interface WorkshopDependencySnapshotBatchOptions {
	getDetailsForWorkshopModList?: GetRawWorkshopDetailsForList;
	now?: number;
}

function getKnownDependencyIds(steamDetails: Iterable<SteamUGCDetails>): bigint[] {
	const dependencyIDs = new Set<bigint>();
	for (const detail of steamDetails) {
		if (detail.result !== EResult.k_EResultOK) {
			continue;
		}
		detail.children?.forEach((dependencyID) => dependencyIDs.add(dependencyID));
	}
	return [...dependencyIDs];
}

function createDependencyNameMap(dependencyDetails: Iterable<SteamUGCDetails>): Map<bigint, string> {
	const dependencyNames = new Map<bigint, string>();
	for (const detail of dependencyDetails) {
		if (detail.result !== EResult.k_EResultOK) {
			continue;
		}
		const title = detail.title.trim();
		if (title.length > 0) {
			dependencyNames.set(detail.publishedFileId, title);
		}
	}
	return dependencyNames;
}

export function createWorkshopDependencySnapshot(
	steamUGCDetails: SteamUGCDetails,
	dependencyNames: Map<bigint, string> = new Map(),
	now = Date.now()
): KnownWorkshopDependencySnapshotMetadata | null {
	if (steamUGCDetails.result !== EResult.k_EResultOK || steamUGCDetails.children === undefined) {
		return null;
	}

	const steamDependencyNames = Object.fromEntries(
		steamUGCDetails.children.flatMap((dependencyID) => {
			const dependencyName = dependencyNames.get(dependencyID);
			return dependencyName === undefined ? [] : [[getSteamDependencyNameKey(dependencyID), dependencyName] as const];
		})
	);

	return {
		steamDependencies: steamUGCDetails.children,
		steamDependencyNames: Object.keys(steamDependencyNames).length > 0 ? steamDependencyNames : undefined,
		steamDependenciesFetchedAt: now
	};
}

export function createWorkshopDependencySnapshotMetadata(
	steamUGCDetails: SteamUGCDetails,
	dependencyNames: Map<bigint, string> = new Map(),
	now = Date.now()
): WorkshopDependencySnapshotMetadata | undefined {
	const snapshot = createWorkshopDependencySnapshot(steamUGCDetails, dependencyNames, now);
	if (snapshot) {
		return snapshot;
	}

	if (steamUGCDetails.result === EResult.k_EResultOK) {
		return createUnknownWorkshopDependencySnapshotMetadata(now);
	}

	return undefined;
}

function createWorkshopDependencySnapshotLookupResult(
	steamUGCDetails: SteamUGCDetails,
	dependencyNames: Map<bigint, string>,
	now: number
): WorkshopDependencySnapshotLookupResult {
	const snapshot = createWorkshopDependencySnapshot(steamUGCDetails, dependencyNames, now);
	if (snapshot) {
		return { status: 'updated', snapshot };
	}

	return steamUGCDetails.result === EResult.k_EResultOK ? { status: 'unknown', checkedAt: now } : { status: 'failed' };
}

export const resolveWorkshopDependencyNames = Effect.fnUntraced(function* (
	steamDetails: Iterable<SteamUGCDetails>,
	getDetailsForWorkshopModList: GetRawWorkshopDetailsForList = getRawWorkshopDetailsForList
): Effect.fn.Return<Map<bigint, string>> {
	const dependencyIDs = getKnownDependencyIds(steamDetails);
	if (dependencyIDs.length === 0) {
		return new Map();
	}

	const dependencyDetails = yield* Effect.forEach(
		chunkWorkshopIds(dependencyIDs),
		(dependencyChunk) => getDetailsForWorkshopModList(dependencyChunk),
		{ concurrency: 1 }
	).pipe(
		Effect.map((chunks) => chunks.flat()),
		Effect.catch((error) => {
			log.warn(`Failed to resolve Workshop dependency names for ${dependencyIDs.length} dependencies.`);
			log.warn(error);
			return Effect.succeed<SteamUGCDetails[]>([]);
		})
	);

	return createDependencyNameMap(dependencyDetails);
});

export const ingestWorkshopDependencySnapshotBatch = Effect.fnUntraced(function* (
	steamDetails: SteamUGCDetails[],
	options: WorkshopDependencySnapshotBatchOptions = {}
): Effect.fn.Return<Map<bigint, WorkshopDependencySnapshotLookupResult>> {
	const { getDetailsForWorkshopModList = getRawWorkshopDetailsForList, now = Date.now() } = options;
	const dependencyNames = yield* resolveWorkshopDependencyNames(steamDetails, getDetailsForWorkshopModList);
	const snapshots = new Map<bigint, WorkshopDependencySnapshotLookupResult>();

	for (const steamUGCDetails of steamDetails) {
		snapshots.set(steamUGCDetails.publishedFileId, createWorkshopDependencySnapshotLookupResult(steamUGCDetails, dependencyNames, now));
	}

	return snapshots;
});

export function applyWorkshopDependencySnapshotResult(
	mod: WorkshopDependencySnapshotMetadata,
	result: WorkshopDependencySnapshotLookupResult
): void {
	const metadataUpdate = getWorkshopDependencySnapshotMetadataUpdate(result);
	if (metadataUpdate) {
		Object.assign(mod, metadataUpdate);
	}
}

export const fetchWorkshopDependencySnapshot = Effect.fnUntraced(function* (
	workshopID: bigint,
	getDetailsForWorkshopModList: GetRawWorkshopDetailsForList = getRawWorkshopDetailsForList,
	now = Date.now()
): Effect.fn.Return<WorkshopDependencySnapshotLookupResult> {
	const steamUGCDetails = yield* getDetailsForWorkshopModList([workshopID]).pipe(
		Effect.map((details) => details[0]),
		Effect.catch((error) => {
			log.warn(`Failed to fetch Workshop dependency snapshot for ${workshopID}.`);
			log.warn(error);
			return Effect.succeed(undefined);
		})
	);

	if (!steamUGCDetails) {
		return { status: 'failed' };
	}

	const snapshots = yield* ingestWorkshopDependencySnapshotBatch([steamUGCDetails], { getDetailsForWorkshopModList, now });
	return snapshots.get(workshopID) ?? { status: 'failed' };
});
