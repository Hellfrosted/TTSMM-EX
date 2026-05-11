import { Effect } from 'effect';
import log from 'electron-log';
import { type ModData, ModType } from '../model';
import { getModDetailsFromPath } from './mod-local-scan';
import { createWorkshopPotentialMod, hasWorkshopModTag, populateWorkshopModMetadata } from './mod-workshop-metadata';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { SteamUGCDetails } from './steamworks';
import { applyWorkshopRuntimeState } from './workshop-actions';

interface WorkshopModHydrationInput {
	keepUnknownWorkshopItem?: boolean;
	onProgress?: (size: number) => void;
	steamUGCDetails?: SteamUGCDetails;
	workshopID: bigint;
}

function logWorkshopMod(mod: ModData) {
	log.silly(JSON.stringify(mod, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
}

export const hydrateWorkshopMod = Effect.fnUntraced(function* ({
	keepUnknownWorkshopItem = false,
	onProgress,
	steamUGCDetails,
	workshopID
}: WorkshopModHydrationInput): Effect.fn.Return<ModData | null, unknown, SteamPersonaCache> {
	const potentialMod = createWorkshopPotentialMod(workshopID);
	yield* populateWorkshopModMetadata(potentialMod, steamUGCDetails);

	const runtimeState = applyWorkshopRuntimeState(potentialMod, { logger: log });
	if (runtimeState.installedPath) {
		if (potentialMod.lastWorkshopUpdate && potentialMod.lastUpdate) {
			potentialMod.needsUpdate = potentialMod.needsUpdate || potentialMod.lastWorkshopUpdate > potentialMod.lastUpdate;
		}

		const resolvedMod = yield* getModDetailsFromPath(potentialMod, runtimeState.installedPath, ModType.WORKSHOP).pipe(
			Effect.catch((error) => {
				log.error(`Error parsing mod info for workshop:${workshopID}`);
				log.error(error);
				return Effect.succeed<ModData | null>(null);
			}),
			Effect.ensuring(Effect.sync(() => onProgress?.(1)))
		);
		if (resolvedMod) {
			logWorkshopMod(resolvedMod);
			return resolvedMod;
		}

		if (keepUnknownWorkshopItem) {
			return potentialMod;
		}

		log.warn(`${potentialMod.workshopID} is NOT a valid mod`);
		return null;
	}

	onProgress?.(1);

	const validMod = !!steamUGCDetails && steamUGCDetails.steamIDOwner !== '0' && hasWorkshopModTag(potentialMod.tags);
	if (validMod || keepUnknownWorkshopItem) {
		logWorkshopMod(potentialMod);
		return potentialMod;
	}

	log.warn(`${potentialMod.workshopID} is NOT a valid mod`);
	return null;
});
