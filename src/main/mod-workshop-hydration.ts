import log from 'electron-log';
import { ModType, type ModData } from '../model';
import type { SteamUGCDetails } from './steamworks';
import { getModDetailsFromPath } from './mod-local-scan';
import { createWorkshopPotentialMod, hasWorkshopModTag, populateWorkshopModMetadata } from './mod-workshop-metadata';
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

export async function hydrateWorkshopMod({
	keepUnknownWorkshopItem = false,
	onProgress,
	steamUGCDetails,
	workshopID
}: WorkshopModHydrationInput): Promise<ModData | null> {
	const potentialMod = createWorkshopPotentialMod(workshopID);
	await populateWorkshopModMetadata(potentialMod, steamUGCDetails);

	const runtimeState = applyWorkshopRuntimeState(potentialMod, { logger: log });
	if (runtimeState.installedPath) {
		if (potentialMod.lastWorkshopUpdate && potentialMod.lastUpdate) {
			potentialMod.needsUpdate = potentialMod.needsUpdate || potentialMod.lastWorkshopUpdate > potentialMod.lastUpdate;
		}

		try {
			const resolvedMod = await getModDetailsFromPath(potentialMod, runtimeState.installedPath, ModType.WORKSHOP);
			if (resolvedMod) {
				logWorkshopMod(resolvedMod);
				return resolvedMod;
			}
		} catch (error) {
			log.error(`Error parsing mod info for workshop:${workshopID}`);
			log.error(error);
		} finally {
			onProgress?.(1);
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
}
