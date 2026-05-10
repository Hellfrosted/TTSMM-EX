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
import { hasSavedCollectionName, readActiveCollection } from './active-collection-persistence';
import {
	createActiveCollectionTransition,
	createCollectionLifecycleFailure as failure,
	deleteActiveCollectionTransition,
	renameActiveCollectionTransition,
	switchActiveCollectionTransition
} from './active-collection-transition';

function validateNewCollectionName(userDataPath: string, name: string, currentName?: string): CollectionLifecycleResult | undefined {
	const validationError = validateCollectionName(name);
	if (validationError) {
		return failure('invalid-name', validationError);
	}

	if (hasSavedCollectionName(userDataPath, name, currentName)) {
		return failure('duplicate-name', `A collection named ${name} already exists`);
	}

	return undefined;
}

export function createAndActivateCollection(userDataPath: string, request: CreateCollectionLifecycleRequest): CollectionLifecycleResult {
	const nameFailure = validateNewCollectionName(userDataPath, request.name);
	if (nameFailure) {
		return nameFailure;
	}

	const collection: ModCollection = {
		name: request.name,
		mods: [...(request.mods ?? [])]
	};
	return createActiveCollectionTransition(userDataPath, {
		config: request.config,
		dirtyCollection: request.dirtyCollection,
		collection
	});
}

export function duplicateAndActivateCollection(
	userDataPath: string,
	request: DuplicateCollectionLifecycleRequest
): CollectionLifecycleResult {
	const source = readActiveCollection(userDataPath, request);
	if (!source) {
		return failure('missing-active-collection', 'No active collection is available to duplicate');
	}

	return createAndActivateCollection(userDataPath, {
		config: request.config,
		dirtyCollection: request.dirtyCollection,
		name: request.name,
		mods: source.mods
	});
}

export function renameActiveCollection(userDataPath: string, request: RenameCollectionLifecycleRequest): CollectionLifecycleResult {
	const activeCollection = readActiveCollection(userDataPath, request);
	if (!activeCollection) {
		return failure('missing-active-collection', 'No active collection is available to rename');
	}

	const nameFailure = validateNewCollectionName(userDataPath, request.name, activeCollection.name);
	if (nameFailure) {
		return nameFailure;
	}

	return renameActiveCollectionTransition(userDataPath, {
		config: request.config,
		activeCollection,
		name: request.name
	});
}

export function deleteActiveCollection(userDataPath: string, request: DeleteCollectionLifecycleRequest): CollectionLifecycleResult {
	const activeCollection = readActiveCollection(userDataPath, request);
	if (!activeCollection) {
		return failure('missing-active-collection', 'No active collection is available to delete');
	}

	return deleteActiveCollectionTransition(userDataPath, {
		config: request.config,
		activeCollection
	});
}

export function switchActiveCollection(userDataPath: string, request: SwitchCollectionLifecycleRequest): CollectionLifecycleResult {
	return switchActiveCollectionTransition(userDataPath, request);
}
