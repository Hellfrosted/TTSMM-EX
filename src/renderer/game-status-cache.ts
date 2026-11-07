import { Effect } from 'effect';
import * as AtomRef from 'effect/reactivity/AtomRef';
import { toEffectOperationError } from 'shared/effect-errors';
import { RendererElectron, runRenderer } from './runtime';

const gameRunningCacheRef = AtomRef.make<boolean | undefined>(undefined);
let gameRunningRequestId = 0;

export function setGameRunningCacheData(running: boolean | undefined) {
	gameRunningRequestId++;
	gameRunningCacheRef.set(running);
}

export async function readGameRunningCache({ forceReload = false }: { forceReload?: boolean } = {}): Promise<boolean> {
	if (!forceReload && gameRunningCacheRef.value !== undefined) {
		return gameRunningCacheRef.value;
	}
	const requestId = ++gameRunningRequestId;
	const running = await runRenderer(gameRunningEffect());
	if (requestId === gameRunningRequestId) gameRunningCacheRef.set(running);
	return running;
}

const gameRunningEffect = Effect.fnUntraced(function* (): Effect.fn.Return<boolean, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.isGameRunning(),
		catch: (error) => toEffectOperationError('read game running status', error)
	});
});
