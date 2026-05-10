import type { AppConfig } from 'model';
import api from 'renderer/Api';

export async function writeConfig(nextConfig: AppConfig): Promise<void> {
	const updateSuccess = await api.updateConfig(nextConfig);
	if (!updateSuccess) {
		throw new Error('Config write was rejected');
	}
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
