import type { AppConfig } from 'model';
import api from 'renderer/Api';
import { setConfigQueryData, writeConfigMutationFn } from 'renderer/async-cache';
import { queryClient as defaultQueryClient } from 'renderer/query-client';
import type { QueryClient } from '@tanstack/react-query';

export async function writeConfig(nextConfig: AppConfig, queryClient: QueryClient = defaultQueryClient): Promise<void> {
	const persistedConfig = await writeConfigMutationFn(nextConfig);
	setConfigQueryData(queryClient, persistedConfig);
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
