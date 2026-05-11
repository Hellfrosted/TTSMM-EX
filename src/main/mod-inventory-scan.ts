import { Context, Effect, Layer } from 'effect';
import type { ModData } from '../model';
import { createModInventoryContext, fetchModInventory } from './mod-fetcher';
import { type SteamPersonaCache, SteamPersonaCacheLive } from './steam-persona-cache';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

export interface ModInventoryScanRequest {
	knownWorkshopMods: bigint[];
	localPath?: string;
	platform?: NodeJS.Platform;
	progressSender: ProgressSender;
	treatNuterraSteamBetaAsEquivalent?: boolean;
}

export class ModInventoryScanner extends Context.Service<
	ModInventoryScanner,
	{
		readonly scan: (request: ModInventoryScanRequest) => Effect.Effect<ModData[], unknown, SteamPersonaCache>;
	}
>()('ttsmm/ModInventoryScanner') {}

export const ModInventoryScannerLive = Layer.succeed(ModInventoryScanner)({
	scan: (request) => {
		const context = createModInventoryContext(request.progressSender, request.localPath, request.knownWorkshopMods, request.platform, {
			treatNuterraSteamBetaAsEquivalent: request.treatNuterraSteamBetaAsEquivalent
		});
		return fetchModInventory(context);
	}
});

export const scanModInventoryProgram = Effect.fnUntraced(function* (
	request: ModInventoryScanRequest
): Effect.fn.Return<ModData[], unknown, ModInventoryScanner | SteamPersonaCache> {
	const scanner = yield* ModInventoryScanner;
	return yield* scanner.scan(request);
});

export function scanModInventory(request: ModInventoryScanRequest): Effect.Effect<ModData[], unknown> {
	return scanModInventoryProgram(request).pipe(Effect.provide(Layer.merge(ModInventoryScannerLive, SteamPersonaCacheLive)));
}
