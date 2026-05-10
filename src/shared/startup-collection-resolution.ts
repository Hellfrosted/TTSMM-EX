import type { AppConfig } from 'model/AppConfig';
import type { ModCollection } from 'model/ModCollection';
import type { CollectionLifecycleFailureCode } from './collection-lifecycle';

export interface StartupCollectionResolutionRequest {
	config: AppConfig;
}

interface StartupCollectionResolutionSuccess {
	ok: true;
	activeCollection: ModCollection;
	collections: ModCollection[];
	collectionNames: string[];
	config: AppConfig;
}

interface StartupCollectionResolutionFailure {
	ok: false;
	code: CollectionLifecycleFailureCode | 'collection-read-failed';
	message: string;
}

export type StartupCollectionResolutionResult = StartupCollectionResolutionSuccess | StartupCollectionResolutionFailure;
