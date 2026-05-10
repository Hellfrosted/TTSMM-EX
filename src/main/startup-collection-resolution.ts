import type { AppConfig, ModCollection } from '../model';
import type { CollectionLifecycleFailureCode } from '../shared/collection-lifecycle';
import type { StartupCollectionResolutionResult } from '../shared/startup-collection-resolution';
import { deleteCollectionFile } from './collection-store';
import {
	createActiveCollectionState,
	createDefaultCollection,
	readSavedCollections,
	withActiveCollection,
	writeActiveCollectionConfig,
	writeCollection
} from './active-collection-persistence';

function failure(code: CollectionLifecycleFailureCode | 'collection-read-failed', message: string): StartupCollectionResolutionResult {
	return {
		ok: false,
		code,
		message
	};
}

function writeConfig(userDataPath: string, config: AppConfig) {
	return writeActiveCollectionConfig(userDataPath, config);
}

function success(config: AppConfig, activeCollection: ModCollection, collections: ModCollection[]): StartupCollectionResolutionResult {
	return {
		ok: true,
		...createActiveCollectionState({
			activeCollection,
			collections,
			config,
			sort: true
		})
	};
}

export function resolveStartupCollection(userDataPath: string, config: AppConfig): StartupCollectionResolutionResult {
	let collections: ModCollection[];
	try {
		collections = readSavedCollections(userDataPath, { sort: true });
	} catch (error) {
		return failure('collection-read-failed', error instanceof Error ? error.message : 'Failed to load collection');
	}

	if (config.activeCollection) {
		const activeCollection = collections.find((collection) => collection.name === config.activeCollection);
		if (activeCollection) {
			return success(config, activeCollection, collections);
		}
	}

	const fallbackCollection = collections[0];
	if (fallbackCollection) {
		const nextConfig = withActiveCollection(config, fallbackCollection.name);
		const persistedConfig = writeConfig(userDataPath, nextConfig);
		if (!persistedConfig) {
			return failure('config-write-failed', `Failed to persist repaired active collection ${fallbackCollection.name}`);
		}

		return success(persistedConfig, fallbackCollection, collections);
	}

	const defaultCollection = createDefaultCollection();
	if (!writeCollection(userDataPath, defaultCollection)) {
		return failure('collection-write-failed', 'Failed to persist the default collection during boot');
	}

	const nextConfig = withActiveCollection(config, defaultCollection.name);
	const persistedConfig = writeConfig(userDataPath, nextConfig);
	if (!persistedConfig) {
		deleteCollectionFile(userDataPath, defaultCollection.name);
		return failure('config-write-failed', 'Failed to persist the default active collection during boot');
	}

	return success(persistedConfig, defaultCollection, [defaultCollection]);
}
