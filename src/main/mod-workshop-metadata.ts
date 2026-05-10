import log from 'electron-log';
import { Effect } from 'effect';
import type { ModData } from '../model';
import { createWorkshopPlaceholderMod } from '../model';
import Steamworks, { type SteamUGCDetails } from './steamworks';
import { SteamPersonaCache } from './steam-persona-cache';
import { WorkshopMetadataLookupFailure } from './workshop-errors';

const MAX_MODS_PER_PAGE = 50;

export function chunkWorkshopIds(workshopIDs: bigint[]): bigint[][] {
	return Array.from({ length: Math.ceil(workshopIDs.length / MAX_MODS_PER_PAGE) }, (_, i) =>
		workshopIDs.slice(i * MAX_MODS_PER_PAGE, i * MAX_MODS_PER_PAGE + MAX_MODS_PER_PAGE)
	);
}

export const getRawWorkshopDetailsForList = Effect.fnUntraced(function* (
	workshopIDs: bigint[]
): Effect.fn.Return<SteamUGCDetails[], WorkshopMetadataLookupFailure> {
	return yield* Effect.tryPromise({
		try: () =>
			new Promise<SteamUGCDetails[]>((resolve, reject) => {
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
			}),
		catch: (error) => new WorkshopMetadataLookupFailure(workshopIDs, error)
	});
});

export function createWorkshopPotentialMod(workshopID: bigint): ModData {
	return {
		...createWorkshopPlaceholderMod(workshopID),
		path: ''
	};
}

export function hasWorkshopModTag(tags: string[] | undefined): boolean {
	return !!tags?.some((tag) => tag.toLowerCase() === 'mods');
}

export const populateWorkshopModMetadata = Effect.fnUntraced(function* (
	potentialMod: ModData,
	steamUGCDetails?: SteamUGCDetails
): Effect.fn.Return<void, unknown, SteamPersonaCache> {
	if (!steamUGCDetails) {
		return;
	}

	potentialMod.description = steamUGCDetails.description;
	potentialMod.name = steamUGCDetails.title;
	potentialMod.tags = steamUGCDetails.tagsDisplayNames;
	potentialMod.size = steamUGCDetails.fileSize;
	potentialMod.dateAdded = new Date(steamUGCDetails.timeAddedToUserList * 1000);
	potentialMod.dateCreated = new Date(steamUGCDetails.timeCreated * 1000);
	potentialMod.lastWorkshopUpdate = new Date(steamUGCDetails.timeUpdated * 1000);
	potentialMod.preview = steamUGCDetails.previewURL;

	const personaCache = yield* SteamPersonaCache;
	const author = yield* personaCache.resolve(steamUGCDetails.steamIDOwner).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to get username for author ${steamUGCDetails.steamIDOwner}`);
			log.warn(error);
			return Effect.succeed(steamUGCDetails.steamIDOwner);
		})
	);
	potentialMod.authors = [author];
});

export const getWorkshopDetailsMap = Effect.fnUntraced(function* (
	workshopIDs: Iterable<bigint>
): Effect.fn.Return<Map<bigint, SteamUGCDetails>> {
	const workshopDetailMap = new Map<bigint, SteamUGCDetails>();

	for (const workshopChunk of chunkWorkshopIds([...workshopIDs])) {
		if (workshopChunk.length === 0) {
			continue;
		}

		const workshopDetails = yield* getRawWorkshopDetailsForList(workshopChunk).pipe(
			Effect.catch((error) => {
				log.warn(
					`Failed to enrich workshop metadata for chunk ${JSON.stringify(workshopChunk, (_, value) => (typeof value === 'bigint' ? value.toString() : value))}`
				);
				log.warn(error);
				return Effect.succeed<SteamUGCDetails[]>([]);
			})
		);
		workshopDetails.forEach((detail) => {
			workshopDetailMap.set(detail.publishedFileId, detail);
		});
	}

	return workshopDetailMap;
});
