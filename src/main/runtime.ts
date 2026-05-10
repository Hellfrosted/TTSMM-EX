import { Effect, Layer, ManagedRuntime } from 'effect';

import { ModInventoryScannerLive, type ModInventoryScanner } from './mod-inventory-scan';
import { SteamPersonaCacheLive, type SteamPersonaCache } from './steam-persona-cache';

export const MainRuntimeLayer = Layer.merge(ModInventoryScannerLive, SteamPersonaCacheLive);

const MainRuntime = ManagedRuntime.make(MainRuntimeLayer);

export function runMain<A, E>(program: Effect.Effect<A, E, ModInventoryScanner | SteamPersonaCache>): Promise<A> {
	return MainRuntime.runPromise(program);
}
