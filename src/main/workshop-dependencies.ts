import log from 'electron-log';
import { chunkWorkshopIds, getRawWorkshopDetailsForList } from './mod-workshop-metadata';
import type { SteamUGCDetails } from './steamworks';
import { EResult } from './steamworks/types';

interface WorkshopDependencySnapshot {
	steamDependencies: bigint[];
	steamDependencyNames?: Record<string, string>;
	steamDependenciesFetchedAt: number;
}

type WorkshopDependencySnapshotLookupResult =
	| { status: 'updated'; snapshot: WorkshopDependencySnapshot }
	| { status: 'unknown'; checkedAt: number }
	| { status: 'failed' };

type GetRawWorkshopDetailsForList = (workshopIDs: bigint[]) => Promise<SteamUGCDetails[]>;

function getKnownDependencyIds(steamDetails: Iterable<SteamUGCDetails>): bigint[] {
	const dependencyIDs = new Set<bigint>();
	for (const detail of steamDetails) {
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
): WorkshopDependencySnapshot | null {
	if (steamUGCDetails.result !== EResult.k_EResultOK || steamUGCDetails.children === undefined) {
		return null;
	}

	const steamDependencyNames = Object.fromEntries(
		steamUGCDetails.children
			.map((dependencyID) => [dependencyID.toString(), dependencyNames.get(dependencyID)] as const)
			.filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
	);

	return {
		steamDependencies: steamUGCDetails.children,
		steamDependencyNames: Object.keys(steamDependencyNames).length > 0 ? steamDependencyNames : undefined,
		steamDependenciesFetchedAt: now
	};
}

export async function resolveWorkshopDependencyNames(
	steamDetails: Iterable<SteamUGCDetails>,
	getDetailsForWorkshopModList: GetRawWorkshopDetailsForList = getRawWorkshopDetailsForList
): Promise<Map<bigint, string>> {
	const dependencyIDs = getKnownDependencyIds(steamDetails);
	if (dependencyIDs.length === 0) {
		return new Map();
	}

	try {
		const dependencyDetails: SteamUGCDetails[] = [];
		for (const dependencyChunk of chunkWorkshopIds(dependencyIDs)) {
			dependencyDetails.push(...(await getDetailsForWorkshopModList(dependencyChunk)));
		}
		return createDependencyNameMap(dependencyDetails);
	} catch (error) {
		log.warn(`Failed to resolve Workshop dependency names for ${dependencyIDs.length} dependencies.`);
		log.warn(error);
		return new Map();
	}
}

export async function fetchWorkshopDependencySnapshot(
	workshopID: bigint,
	getDetailsForWorkshopModList: GetRawWorkshopDetailsForList = getRawWorkshopDetailsForList,
	now = Date.now()
): Promise<WorkshopDependencySnapshotLookupResult> {
	let steamUGCDetails: SteamUGCDetails | undefined;
	try {
		[steamUGCDetails] = await getDetailsForWorkshopModList([workshopID]);
	} catch (error) {
		log.warn(`Failed to fetch Workshop dependency snapshot for ${workshopID}.`);
		log.warn(error);
		return { status: 'failed' };
	}

	if (!steamUGCDetails) {
		return { status: 'failed' };
	}

	const dependencyNames = await resolveWorkshopDependencyNames([steamUGCDetails], getDetailsForWorkshopModList);
	const snapshot = createWorkshopDependencySnapshot(steamUGCDetails, dependencyNames, now);
	if (!snapshot) {
		return steamUGCDetails.result === EResult.k_EResultOK ? { status: 'unknown', checkedAt: now } : { status: 'failed' };
	}
	return { status: 'updated', snapshot };
}
