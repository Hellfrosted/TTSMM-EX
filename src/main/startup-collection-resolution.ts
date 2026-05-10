import type { AppConfig } from '../model';
import type { StartupCollectionResolutionResult } from '../shared/startup-collection-resolution';
import { resolveStartupActiveCollectionTransition } from './active-collection-transition';

export function resolveStartupCollection(userDataPath: string, config: AppConfig): StartupCollectionResolutionResult {
	return resolveStartupActiveCollectionTransition(userDataPath, { config });
}
