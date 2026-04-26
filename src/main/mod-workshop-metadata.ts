import log from 'electron-log';
import type { ModData } from '../model';
import { ModType } from '../model';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import { resolvePersonaName } from './steam-persona-cache';

const MAX_MODS_PER_PAGE = 50;

export function chunkWorkshopIds(workshopIDs: bigint[]): bigint[][] {
	return Array.from({ length: Math.ceil(workshopIDs.length / MAX_MODS_PER_PAGE) }, (_, i) =>
		workshopIDs.slice(i * MAX_MODS_PER_PAGE, i * MAX_MODS_PER_PAGE + MAX_MODS_PER_PAGE)
	);
}

export async function getRawWorkshopDetailsForList(workshopIDs: bigint[]): Promise<SteamUGCDetails[]> {
	return new Promise((resolve, reject) => {
		Steamworks.getUGCDetails(
			workshopIDs.map((workshopID) => workshopID.toString()),
			(steamDetails: SteamUGCDetails[]) => {
				log.silly(
					`Raw workshop list results: ${JSON.stringify(steamDetails, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}`
				);
				resolve(steamDetails);
			},
			(err: Error) => {
				log.error(`Failed to fetch mod details for workshop mods ${workshopIDs}`);
				log.error(err);
				reject(err);
			}
		);
	});
}

export function createWorkshopPotentialMod(workshopID: bigint): ModData {
	return {
		uid: `${ModType.WORKSHOP}:${workshopID}`,
		id: null,
		type: ModType.WORKSHOP,
		workshopID,
		hasCode: false,
		path: '',
		name: `Workshop item ${workshopID.toString()}`
	};
}

export function hasWorkshopModTag(tags: string[] | undefined): boolean {
	return !!tags?.some((tag) => tag.toLowerCase() === 'mods');
}

export async function populateWorkshopModMetadata(potentialMod: ModData, steamUGCDetails?: SteamUGCDetails): Promise<void> {
	if (!steamUGCDetails) {
		return;
	}

	potentialMod.steamDependencies = steamUGCDetails.children;
	potentialMod.steamDependenciesFetchedAt = Date.now();
	potentialMod.description = steamUGCDetails.description;
	potentialMod.name = steamUGCDetails.title;
	potentialMod.tags = steamUGCDetails.tagsDisplayNames;
	potentialMod.size = steamUGCDetails.fileSize;
	potentialMod.dateAdded = new Date(steamUGCDetails.timeAddedToUserList * 1000);
	potentialMod.dateCreated = new Date(steamUGCDetails.timeCreated * 1000);
	potentialMod.lastWorkshopUpdate = new Date(steamUGCDetails.timeUpdated * 1000);
	potentialMod.preview = steamUGCDetails.previewURL;

	try {
		potentialMod.authors = [await resolvePersonaName(steamUGCDetails.steamIDOwner)];
	} catch (err) {
		log.warn(`Failed to get username for author ${steamUGCDetails.steamIDOwner}`);
		log.warn(err);
		potentialMod.authors = [steamUGCDetails.steamIDOwner];
	}
}

export async function getWorkshopDetailsMap(workshopIDs: Iterable<bigint>): Promise<Map<bigint, SteamUGCDetails>> {
	const workshopDetailMap = new Map<bigint, SteamUGCDetails>();

	for (const workshopChunk of chunkWorkshopIds([...workshopIDs])) {
		if (workshopChunk.length === 0) {
			continue;
		}

		try {
			const workshopDetails = await getRawWorkshopDetailsForList(workshopChunk);
			workshopDetails.forEach((detail) => {
				workshopDetailMap.set(detail.publishedFileId, detail);
			});
		} catch (error) {
			log.warn(
				`Failed to enrich workshop metadata for chunk ${JSON.stringify(workshopChunk, (_, value) => (typeof value === 'bigint' ? value.toString() : value))}`
			);
			log.warn(error);
		}
	}

	return workshopDetailMap;
}
