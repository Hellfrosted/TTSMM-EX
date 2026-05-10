import path from 'path';
import { cloneCollection, type AppConfig, type ModCollection } from '../model';
import { collectionNamesEqual } from '../shared/collection-name';
import { listCollections, readCollectionFile, updateCollectionFile } from './collection-store';
import { writeConfigFile } from './config-store';

const DEFAULT_COLLECTION_NAME = 'default';

interface ActiveCollectionState {
	activeCollection: ModCollection;
	collections: ModCollection[];
	collectionNames: string[];
	config: AppConfig;
}

export function createDefaultCollection(): ModCollection {
	return {
		name: DEFAULT_COLLECTION_NAME,
		mods: []
	};
}

export function withActiveCollection(config: AppConfig, activeCollection: string): AppConfig {
	return {
		...config,
		activeCollection
	};
}

export function writeActiveCollectionConfig(userDataPath: string, config: AppConfig) {
	return writeConfigFile(path.join(userDataPath, 'config.json'), config);
}

export function readSavedCollections(userDataPath: string, options: { sort?: boolean } = {}) {
	const collectionNames = listCollections(userDataPath);
	if (options.sort) {
		collectionNames.sort();
	}

	return collectionNames
		.map((name) => readCollectionFile(userDataPath, name))
		.filter((collection): collection is ModCollection => !!collection);
}

export function readActiveCollection(userDataPath: string, request: { config: AppConfig; dirtyCollection?: ModCollection }) {
	if (request.dirtyCollection) {
		return cloneCollection(request.dirtyCollection);
	}

	if (!request.config.activeCollection) {
		return undefined;
	}

	return readCollectionFile(userDataPath, request.config.activeCollection) ?? undefined;
}

export function hasSavedCollectionName(userDataPath: string, name: string, currentName?: string) {
	return listCollections(userDataPath).some((collectionName) => {
		if (currentName && collectionNamesEqual(collectionName, currentName)) {
			return false;
		}
		return collectionNamesEqual(collectionName, name);
	});
}

export function selectReplacementCollection(
	userDataPath: string,
	deletedName: string
): { collection: ModCollection; createdFallback: boolean } | undefined {
	const remainingName = listCollections(userDataPath)
		.filter((name) => !collectionNamesEqual(name, deletedName))
		.sort()[0];
	if (remainingName) {
		const collection = readCollectionFile(userDataPath, remainingName);
		return collection ? { collection, createdFallback: false } : undefined;
	}

	return {
		collection: createDefaultCollection(),
		createdFallback: true
	};
}

export function createActiveCollectionState(input: {
	activeCollection: ModCollection;
	collections: ModCollection[];
	config: AppConfig;
	sort?: boolean;
}): ActiveCollectionState {
	const collectionMap = new Map(input.collections.map((collection) => [collection.name, cloneCollection(collection)]));
	collectionMap.set(input.activeCollection.name, cloneCollection(input.activeCollection));
	const collections = [...collectionMap.values()];
	if (input.sort) {
		collections.sort((left, right) => left.name.localeCompare(right.name));
	}

	return {
		activeCollection: cloneCollection(input.activeCollection),
		collections,
		collectionNames: collections.map((collection) => collection.name),
		config: input.config
	};
}

export function writeCollection(userDataPath: string, collection: ModCollection) {
	return updateCollectionFile(userDataPath, cloneCollection(collection));
}
