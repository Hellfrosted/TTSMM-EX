import type { ModData } from '../model';
import { createModInventoryContext, fetchModInventory } from './mod-fetcher';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

interface ModInventoryScanRequest {
	knownWorkshopMods: bigint[];
	localPath?: string;
	platform?: NodeJS.Platform;
	progressSender: ProgressSender;
	skipWorkshopSteamworks?: boolean;
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

export function scanModInventory(request: ModInventoryScanRequest): Promise<ModData[]> {
	const context = createModInventoryContext(request.progressSender, request.localPath, request.knownWorkshopMods, request.platform, {
		skipWorkshopSteamworks: request.skipWorkshopSteamworks,
		treatNuterraSteamBetaAsEquivalent: request.treatNuterraSteamBetaAsEquivalent
	});
	return fetchModInventory(context);
}
