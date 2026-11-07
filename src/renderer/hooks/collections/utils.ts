import type { AppConfig } from 'model';

export function cloneAppConfig(config: AppConfig): AppConfig {
	return structuredClone(config);
}
