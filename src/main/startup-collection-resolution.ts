import { Effect } from 'effect';
import type { AppConfig } from '../model';
import type { StartupCollectionResolutionResult } from '../shared/startup-collection-resolution';
import { resolveStartupActiveCollectionTransition } from './active-collection-transition';

export const resolveStartupCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	config: AppConfig
): Effect.fn.Return<StartupCollectionResolutionResult, Error> {
	return yield* resolveStartupActiveCollectionTransition(userDataPath, { config });
});
