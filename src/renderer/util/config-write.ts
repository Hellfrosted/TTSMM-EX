import type { AppConfig } from 'model';
import api from 'renderer/Api';
import { setConfigQueryData, writeConfigMutationFn } from 'renderer/async-cache';
import { queryClient as defaultQueryClient } from 'renderer/query-client';
import type { QueryClient } from '@tanstack/react-query';

type ConfigCommit = (nextConfig: AppConfig) => void;

export async function writeConfig(nextConfig: AppConfig, queryClient: QueryClient = defaultQueryClient): Promise<AppConfig> {
	const persistedConfig = await writeConfigMutationFn(nextConfig);
	setConfigQueryData(queryClient, persistedConfig);
	return persistedConfig;
}

export async function persistConfigChange(nextConfig: AppConfig | undefined, commit: ConfigCommit) {
	if (!nextConfig) {
		return true;
	}

	const persistedConfig = await writeConfig(nextConfig);
	commit(persistedConfig);
	return true;
}

export async function tryWriteConfig(nextConfig: AppConfig): Promise<boolean> {
	try {
		await writeConfig(nextConfig);
		return true;
	} catch (error) {
		api.logger.error(error);
		return false;
	}
}
