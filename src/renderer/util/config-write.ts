import type { AppConfig } from 'model';
import { Effect } from 'effect';
import api from 'renderer/Api';
import { setConfigCacheData, writeConfigEffect } from 'renderer/async-cache';
import { runRenderer, type RendererElectron } from 'renderer/runtime';

type ConfigCommit = (nextConfig: AppConfig) => void;

const writeConfigProgram = Effect.fnUntraced(function* (nextConfig: AppConfig): Effect.fn.Return<AppConfig, unknown, RendererElectron> {
	const persistedConfig = yield* writeConfigEffect(nextConfig);
	setConfigCacheData(persistedConfig);
	return persistedConfig;
});

export function writeConfig(nextConfig: AppConfig): Promise<AppConfig> {
	return runRenderer(writeConfigProgram(nextConfig));
}

export const persistConfigChangeProgram = Effect.fnUntraced(function* (
	nextConfig: AppConfig | undefined,
	commit: ConfigCommit
): Effect.fn.Return<boolean, unknown, RendererElectron> {
	if (!nextConfig) {
		return true;
	}

	const persistedConfig = yield* writeConfigProgram(nextConfig);
	yield* Effect.try({
		try: () => commit(persistedConfig),
		catch: (error) => error
	});
	return true;
});

export function persistConfigChange(nextConfig: AppConfig | undefined, commit: ConfigCommit): Promise<boolean> {
	return runRenderer(persistConfigChangeProgram(nextConfig, commit));
}

const tryWriteConfigProgram = Effect.fnUntraced(function* (nextConfig: AppConfig): Effect.fn.Return<boolean, never, RendererElectron> {
	return yield* writeConfigProgram(nextConfig).pipe(
		Effect.map(() => true),
		Effect.catch((error) => {
			api.logger.error(error);
			return Effect.succeed(false);
		})
	);
});

export function tryWriteConfig(nextConfig: AppConfig): Promise<boolean> {
	return runRenderer(tryWriteConfigProgram(nextConfig));
}
