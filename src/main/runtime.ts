import { Effect, Layer, ManagedRuntime } from 'effect';

import { type ModInventoryScanner, ModInventoryScannerLive } from './mod-inventory-scan';
import { MainPlatformNodeProofLayer } from './platform-node-proof';
import { type SteamPersonaCache, SteamPersonaCacheLive } from './steam-persona-cache';

export const MainRuntimeLayer = Layer.mergeAll(ModInventoryScannerLive, SteamPersonaCacheLive, MainPlatformNodeProofLayer);

const MainRuntime = ManagedRuntime.make(MainRuntimeLayer);

export function runMain<A, E, R extends ModInventoryScanner | SteamPersonaCache = ModInventoryScanner | SteamPersonaCache>(
	program: Effect.Effect<A, E, R>
): Promise<A> {
	return MainRuntime.runPromise(program);
}
