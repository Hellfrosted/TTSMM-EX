import { Effect } from 'effect';
import type { ModCollection } from '../model';
import type {
	CollectionLifecycleResult,
	CreateCollectionLifecycleRequest,
	DeleteCollectionLifecycleRequest,
	DuplicateCollectionLifecycleRequest,
	RenameCollectionLifecycleRequest,
	SwitchCollectionLifecycleRequest
} from '../shared/collection-lifecycle';
import { validateCollectionName } from '../shared/collection-name';
import { hasSavedCollectionNameEffect, readActiveCollectionEffect } from './active-collection-persistence';
import {
	createActiveCollectionTransition,
	deleteActiveCollectionTransition,
	createCollectionLifecycleFailure as failure,
	renameActiveCollectionTransition,
	switchActiveCollectionTransition
} from './active-collection-transition';

const validateNewCollectionName = Effect.fnUntraced(function* (
	userDataPath: string,
	name: string,
	currentName?: string
): Effect.fn.Return<CollectionLifecycleResult | undefined> {
	const validationError = validateCollectionName(name);
	if (validationError) {
		return failure('invalid-name', validationError);
	}

	if (yield* hasSavedCollectionNameEffect(userDataPath, name, currentName)) {
		return failure('duplicate-name', `A collection named ${name} already exists`);
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
	const source = yield* readActiveCollectionEffect(userDataPath, request);
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
	const activeCollection = yield* readActiveCollectionEffect(userDataPath, request);
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
	const activeCollection = yield* readActiveCollectionEffect(userDataPath, request);
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
