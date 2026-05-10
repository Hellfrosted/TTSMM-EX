import { cloneCollection, type AppConfig, type ModCollection } from '../model';
import type {
	CollectionLifecycleFailureCode,
	CollectionLifecycleResult,
	CreateCollectionLifecycleRequest,
	DeleteCollectionLifecycleRequest,
	DuplicateCollectionLifecycleRequest,
	RenameCollectionLifecycleRequest,
	SwitchCollectionLifecycleRequest
} from '../shared/collection-lifecycle';
import { validateCollectionName } from '../shared/collection-name';
import { deleteCollectionFile, readCollectionFile, renameCollectionFile } from './collection-store';
import {
	createActiveCollectionState,
	hasSavedCollectionName,
	readActiveCollection,
	readSavedCollections,
	selectReplacementCollection,
	withActiveCollection,
	writeActiveCollectionConfig,
	writeCollection
} from './active-collection-persistence';

function failure(code: CollectionLifecycleFailureCode, message: string): CollectionLifecycleResult {
	return {
		ok: false,
		code,
		message
	};
}

function writeConfig(userDataPath: string, config: AppConfig) {
	return writeActiveCollectionConfig(userDataPath, config);
}

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

function persistDirtyCollection(userDataPath: string, dirtyCollection: ModCollection | undefined): CollectionLifecycleResult | undefined {
	if (!dirtyCollection) {
		return undefined;
	}

	if (!writeCollection(userDataPath, dirtyCollection)) {
		return failure('dirty-collection-write-failed', `Failed to save collection ${dirtyCollection.name}`);
	}

	return undefined;
}

function success(userDataPath: string, config: AppConfig, activeCollection: ModCollection): CollectionLifecycleResult {
	return {
		ok: true,
		...createActiveCollectionState({
			activeCollection,
			collections: readSavedCollections(userDataPath),
			config
		})
	};
}

function activateCollection(
	userDataPath: string,
	config: AppConfig,
	activeCollection: ModCollection,
	onConfigWriteFailure: () => CollectionLifecycleResult
): CollectionLifecycleResult {
	const nextConfig = withActiveCollection(config, activeCollection.name);
	const persistedConfig = writeConfig(userDataPath, nextConfig);
	if (!persistedConfig) {
		return onConfigWriteFailure();
	}

	return success(userDataPath, persistedConfig, activeCollection);
}

export function createAndActivateCollection(userDataPath: string, request: CreateCollectionLifecycleRequest): CollectionLifecycleResult {
	const nameFailure = validateNewCollectionName(userDataPath, request.name);
	if (nameFailure) {
		return nameFailure;
	}

	const dirtyFailure = persistDirtyCollection(userDataPath, request.dirtyCollection);
	if (dirtyFailure) {
		return dirtyFailure;
	}

	const collection: ModCollection = {
		name: request.name,
		mods: [...(request.mods ?? [])]
	};
	if (!writeCollection(userDataPath, collection)) {
		return failure('collection-write-failed', `Failed to create collection ${request.name}`);
	}

	return activateCollection(userDataPath, request.config, collection, () => {
		const rolledBack = deleteCollectionFile(userDataPath, request.name);
		return failure(rolledBack ? 'config-write-failed' : 'rollback-failed', `Created collection ${request.name} but failed to activate it`);
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

	if (!renameCollectionFile(userDataPath, activeCollection, request.name)) {
		return failure('collection-write-failed', `Failed to rename collection ${activeCollection.name} to ${request.name}`);
	}

	const renamedCollection = {
		...cloneCollection(activeCollection),
		name: request.name
	};
	return activateCollection(userDataPath, request.config, renamedCollection, () => {
		const rolledBack = renameCollectionFile(userDataPath, renamedCollection, activeCollection.name);
		return failure(
			rolledBack ? 'config-write-failed' : 'rollback-failed',
			`Renamed collection ${activeCollection.name} but failed to persist the active collection change`
		);
	});
}

export function deleteActiveCollection(userDataPath: string, request: DeleteCollectionLifecycleRequest): CollectionLifecycleResult {
	const activeCollection = readActiveCollection(userDataPath, request);
	if (!activeCollection) {
		return failure('missing-active-collection', 'No active collection is available to delete');
	}

	if (!deleteCollectionFile(userDataPath, activeCollection.name)) {
		return failure('collection-delete-failed', 'Failed to delete collection');
	}

	const replacement = selectReplacementCollection(userDataPath, activeCollection.name);
	if (!replacement) {
		return failure('missing-target-collection', 'Failed to select a replacement collection');
	}

	if (replacement.createdFallback && !writeCollection(userDataPath, replacement.collection)) {
		return failure('collection-write-failed', `Failed to create replacement collection ${replacement.collection.name}`);
	}

	return activateCollection(userDataPath, request.config, replacement.collection, () => {
		if (replacement.createdFallback) {
			deleteCollectionFile(userDataPath, replacement.collection.name);
		}
		const restored = writeCollection(userDataPath, activeCollection);
		return failure(
			restored ? 'config-write-failed' : 'rollback-failed',
			`Deleted collection ${activeCollection.name} but failed to persist the replacement selection`
		);
	});
}

export function switchActiveCollection(userDataPath: string, request: SwitchCollectionLifecycleRequest): CollectionLifecycleResult {
	const dirtyFailure = persistDirtyCollection(userDataPath, request.dirtyCollection);
	if (dirtyFailure) {
		return dirtyFailure;
	}

	const targetCollection = readCollectionFile(userDataPath, request.name);
	if (!targetCollection) {
		return failure('missing-target-collection', `Collection ${request.name} does not exist`);
	}

	return activateCollection(userDataPath, request.config, targetCollection, () =>
		failure('config-write-failed', `Failed to switch to collection ${request.name}`)
	);
}
