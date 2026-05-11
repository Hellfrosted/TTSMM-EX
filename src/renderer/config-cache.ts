import { useAtomRef } from '@effect/atom-react';
import { Effect } from 'effect';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { AppConfig } from 'model';
import { useCacheMutation } from './cache-mutation';
import { RendererElectron, runRenderer } from './runtime';

const configCacheRef = AtomRef.make<AppConfig | null | undefined>(undefined);

export function setConfigCacheData(config: AppConfig | null | undefined) {
	configCacheRef.set(config);
}

export function useConfigCacheValue() {
	return useAtomRef(configCacheRef);
}

export async function readConfigCache(): Promise<AppConfig | null> {
	const cachedConfig = configCacheRef.value;
	if (cachedConfig !== undefined) {
		return cachedConfig;
	}
	const config = await runRenderer(readConfigEffect());
	configCacheRef.set(config);
	return config;
}

const readConfigEffect = Effect.fnUntraced(function* (): Effect.fn.Return<AppConfig | null, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.readConfig(),
		catch: (error) => error
	});
});

export const writeConfigEffect = Effect.fnUntraced(function* (
	nextConfig: AppConfig
): Effect.fn.Return<AppConfig, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const persistedConfig = yield* Effect.tryPromise({
		try: () => renderer.electron.updateConfig(nextConfig),
		catch: (error) => error
	});
	if (!persistedConfig) {
		return yield* Effect.fail(new Error('Config write was rejected'));
	}
	return persistedConfig;
});

function writeConfigMutationFn(nextConfig: AppConfig) {
	return runRenderer(writeConfigEffect(nextConfig));
}

export function useWriteConfigMutation() {
	return useCacheMutation(writeConfigMutationFn, (nextConfig) => {
		setConfigCacheData(nextConfig);
	});
}
