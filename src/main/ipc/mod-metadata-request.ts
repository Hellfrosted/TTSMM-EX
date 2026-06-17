import log from 'electron-log';

import { parseWorkshopModUid } from '../../model';
import { expandUserPath } from '../path-utils';
import type { ReadModMetadataPayload } from './mod-validation';

export interface NormalizedModMetadataRequest {
	readonly knownWorkshopMods: bigint[];
	readonly localPath?: string;
	readonly treatNuterraSteamBetaAsEquivalent?: boolean;
}

export function normalizeReadModMetadataRequest(payload: ReadModMetadataPayload): NormalizedModMetadataRequest {
	const knownWorkshopMods = payload.allKnownMods.flatMap((uid) => {
		log.debug(`Found known mod ${uid}`);
		const workshopID = parseWorkshopModUid(uid);
		if (workshopID === null) {
			return [];
		}
		log.debug(`Found workshop mod ${workshopID.toString()}`);
		return [workshopID];
	});

	return {
		knownWorkshopMods,
		localPath: expandUserPath(payload.localDir) ?? undefined,
		treatNuterraSteamBetaAsEquivalent: payload.treatNuterraSteamBetaAsEquivalent
	};
}
