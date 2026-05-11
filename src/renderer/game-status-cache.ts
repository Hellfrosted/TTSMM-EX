import { Effect } from 'effect';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import { RendererElectron, runRenderer } from './runtime';

const gameRunningCacheRef = AtomRef.make<boolean | undefined>(undefined);

export function setGameRunningCacheData(running: boolean | undefined) {
	gameRunningCacheRef.set(running);
}

export async function readGameRunningCache({ forceReload = false }: { forceReload?: boolean } = {}): Promise<boolean> {
	if (!forceReload && gameRunningCacheRef.value !== undefined) {
		return gameRunningCacheRef.value;
	}
	const running = await runRenderer(gameRunningEffect());
	gameRunningCacheRef.set(running);
	return running;
}

const gameRunningEffect = Effect.fnUntraced(function* (): Effect.fn.Return<boolean, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.isGameRunning(),
		catch: (error) => error
	});
});
