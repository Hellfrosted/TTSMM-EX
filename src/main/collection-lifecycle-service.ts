import { Effect } from 'effect';
import type { ModCollection } from '../model';
import type {
	CollectionLifecycleBaseRequest,
	CollectionLifecycleResult,
	CreateCollectionLifecycleRequest,
	DeleteCollectionLifecycleRequest,
	DuplicateCollectionLifecycleRequest,
	RenameCollectionLifecycleRequest,
	SwitchCollectionLifecycleRequest
} from '../shared/collection-lifecycle';
import { collectionNamesEqual, validateCollectionName } from '../shared/collection-name';
import { collectionNameExists, readActiveCollectionForLifecycle } from './active-collection-persistence';
import {
	createActiveCollectionTransition,
	deleteActiveCollectionTransition,
	createCollectionLifecycleFailure as failure,
	renameActiveCollectionTransition,
	switchActiveCollectionTransition
} from './active-collection-transition';
import { readCollectionFileEffect } from './collection-store';

const validateNewCollectionName = Effect.fnUntraced(function* (
	userDataPath: string,
	name: string,
	currentName?: string
): Effect.fn.Return<CollectionLifecycleResult | undefined, Error> {
	const validationError = validateCollectionName(name);
	if (validationError) {
		return failure('invalid-name', validationError);
	}

	if (yield* collectionNameExists(userDataPath, name, currentName)) {
		return failure('duplicate-name', `A collection named ${name} already exists`);
	}

	return undefined;
});

const validateDirtyCollection = Effect.fnUntraced(function* (userDataPath: string, request: CollectionLifecycleBaseRequest) {
	if (!request.dirtyCollection) return undefined;
	const activeName = request.config.activeCollection;
	if (
		!activeName ||
		!collectionNamesEqual(activeName, request.dirtyCollection.name) ||
		!(yield* readCollectionFileEffect(userDataPath, activeName))
	) {
		return failure('dirty-collection-write-failed', 'The draft no longer matches an existing active collection');
	}
	return undefined;
});

export type CollectionLifecycleCommand =
	| {
			request: CreateCollectionLifecycleRequest;
			type: 'create';
	  }
	| {
			request: DuplicateCollectionLifecycleRequest;
			type: 'duplicate';
	  }
	| {
			request: RenameCollectionLifecycleRequest;
			type: 'rename';
	  }
	| {
			request: DeleteCollectionLifecycleRequest;
			type: 'delete';
	  }
	| {
			request: SwitchCollectionLifecycleRequest;
			type: 'switch';
	  };

export const createAndActivateCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	request: CreateCollectionLifecycleRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* validateDirtyCollection(userDataPath, request);
	if (dirtyFailure) return dirtyFailure;
	const nameFailure = yield* validateNewCollectionName(userDataPath, request.name);
	if (nameFailure) {
		return nameFailure;
	}

	const collection: ModCollection = {
		name: request.name,
		mods: [...(request.mods ?? [])]
	};
	return yield* createActiveCollectionTransition(userDataPath, {
		config: request.config,
		dirtyCollection: request.dirtyCollection,
		collection
	});
});

export const duplicateAndActivateCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	request: DuplicateCollectionLifecycleRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* validateDirtyCollection(userDataPath, request);
	if (dirtyFailure) return dirtyFailure;
	const source = yield* readActiveCollectionForLifecycle(userDataPath, request);
	if (!source) {
		return failure('missing-active-collection', 'No active collection is available to duplicate');
	}

	return yield* createAndActivateCollection(userDataPath, {
		config: request.config,
		dirtyCollection: request.dirtyCollection,
		name: request.name,
		mods: source.mods
	});
});

export const renameActiveCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	request: RenameCollectionLifecycleRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* validateDirtyCollection(userDataPath, request);
	if (dirtyFailure) return dirtyFailure;
	const activeCollection = yield* readActiveCollectionForLifecycle(userDataPath, request);
	if (!activeCollection) {
		return failure('missing-active-collection', 'No active collection is available to rename');
	}

	const nameFailure = yield* validateNewCollectionName(userDataPath, request.name, activeCollection.name);
	if (nameFailure) {
		return nameFailure;
	}

	return yield* renameActiveCollectionTransition(userDataPath, {
		config: request.config,
		activeCollection,
		name: request.name
	});
});

export const deleteActiveCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	request: DeleteCollectionLifecycleRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* validateDirtyCollection(userDataPath, request);
	if (dirtyFailure) return dirtyFailure;
	const activeCollection = yield* readActiveCollectionForLifecycle(userDataPath, request);
	if (!activeCollection) {
		return failure('missing-active-collection', 'No active collection is available to delete');
	}

	return yield* deleteActiveCollectionTransition(userDataPath, {
		config: request.config,
		activeCollection
	});
});

export const switchActiveCollection = Effect.fnUntraced(function* (
	userDataPath: string,
	request: SwitchCollectionLifecycleRequest
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	const dirtyFailure = yield* validateDirtyCollection(userDataPath, request);
	if (dirtyFailure) return dirtyFailure;
	return yield* switchActiveCollectionTransition(userDataPath, request);
});

export const runCollectionLifecycle = Effect.fnUntraced(function* (
	userDataPath: string,
	command: CollectionLifecycleCommand
): Effect.fn.Return<CollectionLifecycleResult, Error> {
	switch (command.type) {
		case 'create':
			return yield* createAndActivateCollection(userDataPath, command.request);
		case 'duplicate':
			return yield* duplicateAndActivateCollection(userDataPath, command.request);
		case 'rename':
			return yield* renameActiveCollection(userDataPath, command.request);
		case 'delete':
			return yield* deleteActiveCollection(userDataPath, command.request);
		case 'switch':
			return yield* switchActiveCollection(userDataPath, command.request);
	}
});
