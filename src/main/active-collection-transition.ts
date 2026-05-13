import { Effect } from 'effect';
import type { AppConfig, ModCollection } from '../model';
import type { CollectionLifecycleFailureCode, CollectionLifecycleResult } from '../shared/collection-lifecycle';
import { collectionNamesEqual } from '../shared/collection-name';
import type { StartupCollectionResolutionResult } from '../shared/startup-collection-resolution';
import {
	createActiveCollectionState,
	createDefaultCollection,
	readSavedCollectionsEffect,
	selectReplacementCollectionEffect,
	withActiveCollection,
	writeActiveCollectionConfigEffect,
	writeCollectionEffect
} from './active-collection-persistence';
import { deleteCollectionFileEffect, readCollectionFileEffect, renameCollectionFileEffect } from './collection-store';

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

const persistDirtyActiveCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	dirtyCollection: ModCollection | undefined
): Effect.fn.Return<CollectionLifecycleResult | undefined> {
	if (!dirtyCollection) {
		return undefined;
	}

	if (!(yield* writeCollectionEffect(userDataPath, dirtyCollection))) {
		return createCollectionLifecycleFailure('dirty-collection-write-failed', `Failed to save collection ${dirtyCollection.name}`);
	}

	return undefined;
});

const createActiveCollectionTransitionSuccess = Effect.fnUntraced(function* (
	userDataPath: string,
	config: AppConfig,
	activeCollection: ModCollection
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	return {
		ok: true,
		...createActiveCollectionState({
			activeCollection,
			collections: yield* readSavedCollectionsEffect(userDataPath),
			config
		})
	};
});

const activateActiveCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	config: AppConfig,
	activeCollection: ModCollection,
	onConfigWriteFailure: () => Effect.Effect<CollectionLifecycleResult, Error>
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const nextConfig = withActiveCollection(config, activeCollection.name);
	const persistedConfig = yield* writeActiveCollectionConfigEffect(userDataPath, nextConfig);
	if (!persistedConfig) {
		yield* writeActiveCollectionConfigEffect(userDataPath, config);
		return yield* onConfigWriteFailure();
	}

	return yield* createActiveCollectionTransitionSuccess(userDataPath, persistedConfig, activeCollection);
});

const restoreDeletedActiveCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	activeCollection: ModCollection,
	code: CollectionLifecycleFailureCode,
	message: string
): Effect.fn.Return<CollectionLifecycleResult> {
	const restored = yield* writeCollectionEffect(userDataPath, activeCollection);
	return createCollectionLifecycleFailure(restored ? code : 'rollback-failed', message);
});

export const createActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: CreateActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* persistDirtyActiveCollection(userDataPath, request.dirtyCollection);
	if (dirtyFailure) {
		return dirtyFailure;
	}

	if (!(yield* writeCollectionEffect(userDataPath, request.collection))) {
		return createCollectionLifecycleFailure('collection-write-failed', `Failed to create collection ${request.collection.name}`);
	}

	return yield* activateActiveCollection(userDataPath, request.config, request.collection, () =>
		deleteCollectionFileEffect(userDataPath, request.collection.name).pipe(
			Effect.map((rolledBack) =>
				createCollectionLifecycleFailure(
					rolledBack ? 'config-write-failed' : 'rollback-failed',
					`Created collection ${request.collection.name} but failed to activate it`
				)
			)
		)
	);
});

export const switchActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: SwitchActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* persistDirtyActiveCollection(userDataPath, request.dirtyCollection);
	if (dirtyFailure) {
		return dirtyFailure;
	}

	const targetCollection = yield* readCollectionFileEffect(userDataPath, request.name);
	if (!targetCollection) {
		return createCollectionLifecycleFailure('missing-target-collection', `Collection ${request.name} does not exist`);
	}

	return yield* activateActiveCollection(userDataPath, request.config, targetCollection, () =>
		Effect.succeed(createCollectionLifecycleFailure('config-write-failed', `Failed to switch to collection ${request.name}`))
	);
});

export const renameActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: RenameActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	if (!(yield* renameCollectionFileEffect(userDataPath, request.activeCollection, request.name))) {
		return createCollectionLifecycleFailure(
			'collection-write-failed',
			`Failed to rename collection ${request.activeCollection.name} to ${request.name}`
		);
	}

	const renamedCollection = {
		...request.activeCollection,
		name: request.name
	};
	return yield* activateActiveCollection(userDataPath, request.config, renamedCollection, () =>
		renameCollectionFileEffect(userDataPath, renamedCollection, request.activeCollection.name).pipe(
			Effect.map((rolledBack) =>
				createCollectionLifecycleFailure(
					rolledBack ? 'config-write-failed' : 'rollback-failed',
					`Renamed collection ${request.activeCollection.name} but failed to persist the active collection change`
				)
			)
		)
	);
});

export const deleteActiveCollectionTransition = Effect.fnUntraced(function* (
	userDataPath: string,
	request: DeleteActiveCollectionTransitionRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	if (!(yield* deleteCollectionFileEffect(userDataPath, request.activeCollection.name))) {
		return createCollectionLifecycleFailure('collection-delete-failed', 'Failed to delete collection');
	}

	let replacement: { collection: ModCollection; createdFallback: boolean } | undefined;
	replacement = yield* selectReplacementCollectionEffect(userDataPath, request.activeCollection.name).pipe(
		Effect.catch(() => Effect.succeed(undefined))
	);
	if (!replacement) {
		return yield* restoreDeletedActiveCollection(
			userDataPath,
			request.activeCollection,
			'missing-target-collection',
			'Failed to select a replacement collection'
		);
	}

	if (replacement.createdFallback && !(yield* writeCollectionEffect(userDataPath, replacement.collection))) {
		yield* deleteCollectionFileEffect(userDataPath, replacement.collection.name);
		return yield* restoreDeletedActiveCollection(
			userDataPath,
			request.activeCollection,
			'collection-write-failed',
			`Failed to create replacement collection ${replacement.collection.name}`
		);
	}

	return yield* activateActiveCollection(userDataPath, request.config, replacement.collection, () =>
		Effect.gen(function* () {
			if (replacement.createdFallback) {
				yield* deleteCollectionFileEffect(userDataPath, replacement.collection.name);
			}
			const restored = yield* writeCollectionEffect(userDataPath, request.activeCollection);
			return createCollectionLifecycleFailure(
				restored ? 'config-write-failed' : 'rollback-failed',
				`Deleted collection ${request.activeCollection.name} but failed to persist the replacement selection`
			);
		})
	);
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
): Effect.fn.Return<StartupCollectionResolutionResult, Error> {
	let collections: ModCollection[];
	const collectionsResult = yield* readSavedCollectionsEffect(userDataPath, { sort: true }).pipe(
		Effect.match({
			onSuccess: (savedCollections) => ({ ok: true as const, collections: savedCollections }),
			onFailure: (error) => ({
				ok: false as const,
				failure: createStartupCollectionFailure(
					'collection-read-failed',
					error instanceof Error ? error.message : 'Failed to load collection'
				)
			})
		})
	);
	if (!collectionsResult.ok) {
		return collectionsResult.failure;
	}
	collections = collectionsResult.collections;

	if (request.config.activeCollection) {
		const activeCollection = collections.find((collection) => collectionNamesEqual(collection.name, request.config.activeCollection ?? ''));
		if (activeCollection) {
			return createStartupTransitionSuccess(request.config, activeCollection, collections);
		}
	}

	const fallbackCollection = collections[0];
	if (fallbackCollection) {
		const nextConfig = withActiveCollection(request.config, fallbackCollection.name);
		const persistedConfig = yield* writeActiveCollectionConfigEffect(userDataPath, nextConfig);
		if (!persistedConfig) {
			return createStartupCollectionFailure(
				'config-write-failed',
				`Failed to persist repaired active collection ${fallbackCollection.name}`
			);
		}

		return createStartupTransitionSuccess(persistedConfig, fallbackCollection, collections);
	}

	const defaultCollection = createDefaultCollection();
	if (!(yield* writeCollectionEffect(userDataPath, defaultCollection))) {
		return createStartupCollectionFailure('collection-write-failed', 'Failed to persist the default collection during boot');
	}

	const nextConfig = withActiveCollection(request.config, defaultCollection.name);
	const persistedConfig = yield* writeActiveCollectionConfigEffect(userDataPath, nextConfig);
	if (!persistedConfig) {
		yield* deleteCollectionFileEffect(userDataPath, defaultCollection.name);
		return createStartupCollectionFailure('config-write-failed', 'Failed to persist the default active collection during boot');
	}

	return createStartupTransitionSuccess(persistedConfig, defaultCollection, [defaultCollection]);
});
