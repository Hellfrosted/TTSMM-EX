import { Effect } from 'effect';
import path from 'path';
import { type AppConfig, cloneCollection, type ModCollection } from '../model';
import { collectionNamesEqual } from '../shared/collection-name';
import {
	listCollections,
	listCollectionsEffect,
	readCollectionFile,
	readCollectionFileEffect,
	updateCollectionFile,
	updateCollectionFileEffect
} from './collection-store';
import { writeConfigFile, writeConfigFileEffect } from './config-store';

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

export function writeActiveCollectionConfigEffect(userDataPath: string, config: AppConfig) {
	return writeConfigFileEffect(path.join(userDataPath, 'config.json'), config);
}

export function readSavedCollections(userDataPath: string, options: { sort?: boolean } = {}) {
	const collectionNames = listCollections(userDataPath);
	if (options.sort) {
		collectionNames.sort();
	}

	return collectionNames.flatMap((name) => {
		const collection = readCollectionFile(userDataPath, name);
		return collection ? [collection] : [];
	});
}

export const readSavedCollectionsEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	options: { sort?: boolean } = {}
): Effect.fn.Return<ModCollection[], Error> {
	const collectionNames = yield* listCollectionsEffect(userDataPath);
	if (options.sort) {
		collectionNames.sort();
	}

	const collections: ModCollection[] = [];
	for (const name of collectionNames) {
		const collection = yield* readCollectionFileEffect(userDataPath, name);
		if (collection) {
			collections.push(collection);
		}
	}
	return collections;
});

export function readActiveCollection(userDataPath: string, request: { config: AppConfig; dirtyCollection?: ModCollection }) {
	if (request.dirtyCollection) {
		return cloneCollection(request.dirtyCollection);
	}

	if (!request.config.activeCollection) {
		return undefined;
	}

	return readCollectionFile(userDataPath, request.config.activeCollection) ?? undefined;
}

export const readActiveCollectionEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	request: { config: AppConfig; dirtyCollection?: ModCollection }
): Effect.fn.Return<ModCollection | undefined, Error> {
	if (request.dirtyCollection) {
		return cloneCollection(request.dirtyCollection);
	}

	if (!request.config.activeCollection) {
		return undefined;
	}

	return (yield* readCollectionFileEffect(userDataPath, request.config.activeCollection)) ?? undefined;
});

export function hasSavedCollectionName(userDataPath: string, name: string, currentName?: string) {
	return listCollections(userDataPath).some((collectionName) => {
		if (currentName && collectionNamesEqual(collectionName, currentName)) {
			return false;
		}
		return collectionNamesEqual(collectionName, name);
	});
}

export const hasSavedCollectionNameEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	name: string,
	currentName?: string
): Effect.fn.Return<boolean> {
	const collectionNames = yield* listCollectionsEffect(userDataPath);
	return collectionNames.some((collectionName) => {
		if (currentName && collectionNamesEqual(collectionName, currentName)) {
			return false;
		}
		return collectionNamesEqual(collectionName, name);
	});
});

export function selectReplacementCollection(
	userDataPath: string,
	deletedName: string
): { collection: ModCollection; createdFallback: boolean } | undefined {
	const remainingNames = listCollections(userDataPath).filter((name) => !collectionNamesEqual(name, deletedName));
	const remainingName =
		remainingNames.length > 0 ? remainingNames.reduce((left, right) => (left.localeCompare(right) <= 0 ? left : right)) : undefined;
	if (remainingName) {
		const collection = readCollectionFile(userDataPath, remainingName);
		return collection ? { collection, createdFallback: false } : undefined;
	}

	return {
		collection: createDefaultCollection(),
		createdFallback: true
	};
}

export const selectReplacementCollectionEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	deletedName: string
): Effect.fn.Return<{ collection: ModCollection; createdFallback: boolean } | undefined, Error> {
	const remainingNames = (yield* listCollectionsEffect(userDataPath)).filter((name) => !collectionNamesEqual(name, deletedName));
	const remainingName =
		remainingNames.length > 0 ? remainingNames.reduce((left, right) => (left.localeCompare(right) <= 0 ? left : right)) : undefined;
	if (remainingName) {
		const collection = yield* readCollectionFileEffect(userDataPath, remainingName);
		return collection ? { collection, createdFallback: false } : undefined;
	}

	return {
		collection: createDefaultCollection(),
		createdFallback: true
	};
});

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

export function writeCollectionEffect(userDataPath: string, collection: ModCollection) {
	return updateCollectionFileEffect(userDataPath, cloneCollection(collection));
}
