import { Effect } from 'effect';
import type { AppConfig, ModCollection } from '../model';
import { collectionNamesEqual } from '../shared/collection-name';
import type { CollectionLifecycleFailureCode, CollectionLifecycleResult } from '../shared/collection-lifecycle';
import type { StartupCollectionResolutionResult } from '../shared/startup-collection-resolution';
import { deleteCollectionFile, readCollectionFile, renameCollectionFile } from './collection-store';
import {
	createActiveCollectionState,
	createDefaultCollection,
	readSavedCollections,
	selectReplacementCollection,
	withActiveCollection,
	writeActiveCollectionConfig,
	writeCollection
} from './active-collection-persistence';

interface ActiveCollectionTransitionBaseRequest {
	config: AppConfig;
	dirtyCollection?: ModCollection;
}

interface CreateActiveCollectionTransitionRequest extends ActiveCollectionTransitionBaseRequest {
	collection: ModCollection;
}

interface SwitchActiveCollectionTransitionRequest extends ActiveCollectionTransitionBaseRequest {
	name: string;
}

interface RenameActiveCollectionTransitionRequest {
	config: AppConfig;
	activeCollection: ModCollection;
	name: string;
}

interface DeleteActiveCollectionTransitionRequest {
	config: AppConfig;
	activeCollection: ModCollection;
}

interface ResolveStartupActiveCollectionTransitionRequest {
	config: AppConfig;
}

export function createCollectionLifecycleFailure(code: CollectionLifecycleFailureCode, message: string): CollectionLifecycleResult {
	return {
		ok: false,
		code,
		message
	};
}

function persistDirtyActiveCollection(
	userDataPath: string,
	dirtyCollection: ModCollection | undefined
): CollectionLifecycleResult | undefined {
	if (!dirtyCollection) {
		return undefined;
	}

	if (!writeCollection(userDataPath, dirtyCollection)) {
		return createCollectionLifecycleFailure('dirty-collection-write-failed', `Failed to save collection ${dirtyCollection.name}`);
	}

	return undefined;
}

function createActiveCollectionTransitionSuccess(
	userDataPath: string,
	config: AppConfig,
	activeCollection: ModCollection
): CollectionLifecycleResult {
	return {
		ok: true,
		...createActiveCollectionState({
			activeCollection,
			collections: readSavedCollections(userDataPath),
			config
		})
	};
}

function activateActiveCollection(
	userDataPath: string,
	config: AppConfig,
	activeCollection: ModCollection,
	onConfigWriteFailure: () => CollectionLifecycleResult
): CollectionLifecycleResult {
	const nextConfig = withActiveCollection(config, activeCollection.name);
	const persistedConfig = writeActiveCollectionConfig(userDataPath, nextConfig);
	if (!persistedConfig) {
		writeActiveCollectionConfig(userDataPath, config);
		return onConfigWriteFailure();
	}

	return createActiveCollectionTransitionSuccess(userDataPath, persistedConfig, activeCollection);
}

function restoreDeletedActiveCollection(
	userDataPath: string,
	activeCollection: ModCollection,
	code: CollectionLifecycleFailureCode,
	message: string
) {
	const restored = writeCollection(userDataPath, activeCollection);
	return createCollectionLifecycleFailure(restored ? code : 'rollback-failed', message);
}

export const createActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: CreateActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult> {
	const dirtyFailure = persistDirtyActiveCollection(userDataPath, request.dirtyCollection);
	if (dirtyFailure) {
		return dirtyFailure;
	}

	if (!writeCollection(userDataPath, request.collection)) {
		return createCollectionLifecycleFailure('collection-write-failed', `Failed to create collection ${request.collection.name}`);
	}

	return activateActiveCollection(userDataPath, request.config, request.collection, () => {
		const rolledBack = deleteCollectionFile(userDataPath, request.collection.name);
		return createCollectionLifecycleFailure(
			rolledBack ? 'config-write-failed' : 'rollback-failed',
			`Created collection ${request.collection.name} but failed to activate it`
		);
	});
});

export const switchActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: SwitchActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult> {
	const dirtyFailure = persistDirtyActiveCollection(userDataPath, request.dirtyCollection);
	if (dirtyFailure) {
		return dirtyFailure;
	}

	const targetCollection = readCollectionFile(userDataPath, request.name);
	if (!targetCollection) {
		return createCollectionLifecycleFailure('missing-target-collection', `Collection ${request.name} does not exist`);
	}

	return activateActiveCollection(userDataPath, request.config, targetCollection, () =>
		createCollectionLifecycleFailure('config-write-failed', `Failed to switch to collection ${request.name}`)
	);
});

export const renameActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: RenameActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult> {
	if (!renameCollectionFile(userDataPath, request.activeCollection, request.name)) {
		return createCollectionLifecycleFailure(
			'collection-write-failed',
			`Failed to rename collection ${request.activeCollection.name} to ${request.name}`
		);
	}

	const renamedCollection = {
		...request.activeCollection,
		name: request.name
	};
	return activateActiveCollection(userDataPath, request.config, renamedCollection, () => {
		const rolledBack = renameCollectionFile(userDataPath, renamedCollection, request.activeCollection.name);
		return createCollectionLifecycleFailure(
			rolledBack ? 'config-write-failed' : 'rollback-failed',
			`Renamed collection ${request.activeCollection.name} but failed to persist the active collection change`
		);
	});
});

export const deleteActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: DeleteActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult> {
	if (!deleteCollectionFile(userDataPath, request.activeCollection.name)) {
		return createCollectionLifecycleFailure('collection-delete-failed', 'Failed to delete collection');
	}

	let replacement: ReturnType<typeof selectReplacementCollection>;
	try {
		replacement = selectReplacementCollection(userDataPath, request.activeCollection.name);
	} catch {
		replacement = undefined;
	}
	if (!replacement) {
		return restoreDeletedActiveCollection(
			userDataPath,
			request.activeCollection,
			'missing-target-collection',
			'Failed to select a replacement collection'
		);
	}

	if (replacement.createdFallback && !writeCollection(userDataPath, replacement.collection)) {
		deleteCollectionFile(userDataPath, replacement.collection.name);
		return restoreDeletedActiveCollection(
			userDataPath,
			request.activeCollection,
			'collection-write-failed',
			`Failed to create replacement collection ${replacement.collection.name}`
		);
	}

	return activateActiveCollection(userDataPath, request.config, replacement.collection, () => {
		if (replacement.createdFallback) {
			deleteCollectionFile(userDataPath, replacement.collection.name);
		}
		const restored = writeCollection(userDataPath, request.activeCollection);
		return createCollectionLifecycleFailure(
			restored ? 'config-write-failed' : 'rollback-failed',
			`Deleted collection ${request.activeCollection.name} but failed to persist the replacement selection`
		);
	});
});

function createStartupCollectionFailure(
	code: CollectionLifecycleFailureCode | 'collection-read-failed',
	message: string
): StartupCollectionResolutionResult {
	return {
		ok: false,
		code,
		message
	};
}

function createStartupTransitionSuccess(
	config: AppConfig,
	activeCollection: ModCollection,
	collections: ModCollection[]
): StartupCollectionResolutionResult {
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

export const resolveStartupActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: ResolveStartupActiveCollectionTransitionRequest
): Effect.fn.Return<StartupCollectionResolutionResult> {
	let collections: ModCollection[];
	try {
		collections = readSavedCollections(userDataPath, { sort: true });
	} catch (error) {
		return createStartupCollectionFailure('collection-read-failed', error instanceof Error ? error.message : 'Failed to load collection');
	}

	if (request.config.activeCollection) {
		const activeCollection = collections.find((collection) => collectionNamesEqual(collection.name, request.config.activeCollection ?? ''));
		if (activeCollection) {
			return createStartupTransitionSuccess(request.config, activeCollection, collections);
		}
	}

	const fallbackCollection = collections[0];
	if (fallbackCollection) {
		const nextConfig = withActiveCollection(request.config, fallbackCollection.name);
		const persistedConfig = writeActiveCollectionConfig(userDataPath, nextConfig);
		if (!persistedConfig) {
			return createStartupCollectionFailure(
				'config-write-failed',
				`Failed to persist repaired active collection ${fallbackCollection.name}`
			);
		}

		return createStartupTransitionSuccess(persistedConfig, fallbackCollection, collections);
	}

	const defaultCollection = createDefaultCollection();
	if (!writeCollection(userDataPath, defaultCollection)) {
		return createStartupCollectionFailure('collection-write-failed', 'Failed to persist the default collection during boot');
	}

	const nextConfig = withActiveCollection(request.config, defaultCollection.name);
	const persistedConfig = writeActiveCollectionConfig(userDataPath, nextConfig);
	if (!persistedConfig) {
		deleteCollectionFile(userDataPath, defaultCollection.name);
		return createStartupCollectionFailure('config-write-failed', 'Failed to persist the default active collection during boot');
	}

	return createStartupTransitionSuccess(persistedConfig, defaultCollection, [defaultCollection]);
});
