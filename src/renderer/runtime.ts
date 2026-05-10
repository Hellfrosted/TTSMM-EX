import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import type { ElectronApi } from 'shared/electron-api';

export class RendererElectron extends Context.Service<
	RendererElectron,
	{
		readonly electron: ElectronApi;
	}
>()('ttsmm/RendererElectron') {}

export const RendererRuntimeLayer = Layer.sync(RendererElectron)(() => ({
	get electron() {
		return window.electron;
	}
}));

const RendererRuntime = ManagedRuntime.make(RendererRuntimeLayer);

export function runRenderer<A, E>(program: Effect.Effect<A, E, RendererElectron>): Promise<A> {
	return RendererRuntime.runPromise(program);
}
