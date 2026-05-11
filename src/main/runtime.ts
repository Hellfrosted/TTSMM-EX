import { Effect, Layer, ManagedRuntime } from 'effect';

import { ModInventoryScannerLive, type ModInventoryScanner } from './mod-inventory-scan';
import { MainPlatformNodeProofLayer } from './platform-node-proof';
import { SteamPersonaCacheLive, type SteamPersonaCache } from './steam-persona-cache';

export const MainRuntimeLayer = Layer.mergeAll(ModInventoryScannerLive, SteamPersonaCacheLive, MainPlatformNodeProofLayer);

const MainRuntime = ManagedRuntime.make(MainRuntimeLayer);

export function runMain<A, E>(program: Effect.Effect<A, E, ModInventoryScanner | SteamPersonaCache>): Promise<A> {
	return MainRuntime.runPromise(program);
}
