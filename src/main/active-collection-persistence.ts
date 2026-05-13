import { Effect } from 'effect';
import path from 'path';
import { type AppConfig, cloneCollection, type ModCollection } from '../model';
import { collectionNamesEqual } from '../shared/collection-name';
import { listCollectionsEffect, readCollectionFileEffect, updateCollectionFileEffect } from './collection-store';
import { writeConfigFileEffect } from './config-store';

const DEFAULT_COLLECTION_NAME = 'default';

interface ActiveCollectionState {
	activeCollection: ModCollection;
	collections: ModCollection[];
	collectionNames: string[];
	config: AppConfig;
}

export function createDefaultActiveCollection(): ModCollection {
	return {
		name: DEFAULT_COLLECTION_NAME,
		mods: []
	};
}

function withActiveCollection(config: AppConfig, activeCollection: string): AppConfig {
	return {
		...config,
		activeCollection
	};
}

export const persistActiveCollectionSelection = Effect.fnUntraced(function* (
	userDataPath: string,
	config: AppConfig,
	activeCollection: string
): Effect.fn.Return<AppConfig | null, Error> {
	return yield* writeConfigFileEffect(path.join(userDataPath, 'config.json'), withActiveCollection(config, activeCollection));
});

export const persistActiveCollectionConfig = Effect.fnUntraced(function* (
	userDataPath: string,
	config: AppConfig
): Effect.fn.Return<AppConfig | null, Error> {
	return yield* writeConfigFileEffect(path.join(userDataPath, 'config.json'), config);
});

export const readSavedActiveCollections = Effect.fnUntraced(function* (
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

export const readActiveCollectionForLifecycle = Effect.fnUntraced(function* (
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

export const collectionNameExists = Effect.fnUntraced(function* (
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

export const selectReplacementActiveCollection = Effect.fnUntraced(function* (
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
		collection: createDefaultActiveCollection(),
		createdFallback: true
	};
});

export function createActiveCollectionLifecycleState(input: {
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

export function persistActiveCollectionFile(userDataPath: string, collection: ModCollection) {
	return updateCollectionFileEffect(userDataPath, cloneCollection(collection));
}
