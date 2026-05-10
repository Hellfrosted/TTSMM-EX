import type { ModData } from '../model';
import ModFetcher from './mod-fetcher';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

interface ModInventoryScanRequest {
	knownWorkshopMods: bigint[];
	localPath?: string;
	platform?: NodeJS.Platform;
	progressSender: ProgressSender;
	skipWorkshopSteamworks?: boolean;
}

export function scanModInventory(request: ModInventoryScanRequest): Promise<ModData[]> {
	const fetcher = new ModFetcher(request.progressSender, request.localPath, request.knownWorkshopMods, request.platform, {
		skipWorkshopSteamworks: request.skipWorkshopSteamworks
	});
	return fetcher.fetchMods();
}
