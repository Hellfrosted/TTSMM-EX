import { Effect } from 'effect';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { ModCollection, ValidChannel } from '../model';
import { validateCollectionName } from '../shared/collection-name';
import { parseStoredModCollectionPayload } from './ipc/collection-validation';
import {
	deleteFileEffect,
	ensureCollectionsDirectory,
	ensureCollectionsDirectoryEffect,
	fileExistsEffect,
	listDirectoryEffect,
	readJsonFileEffect,
	realpathEffect,
	writeUtf8FileAtomicEffect
} from './storage';

function serializeCollectionFile(collection: Pick<ModCollection, 'mods'>): string {
	return JSON.stringify({ mods: [...collection.mods] }, null, 4);
}

function resolveCollectionFilePath(userDataPath: string, collectionName: string): string | null {
	const validationError = validateCollectionName(collectionName);
	if (validationError) {
		log.warn(`Rejected invalid collection name "${collectionName}": ${validationError}`);
		return null;
	}

	const collectionsDirectory = ensureCollectionsDirectory(userDataPath);
	const filepath = path.resolve(collectionsDirectory, `${collectionName}.json`);
	const relativePath = path.relative(collectionsDirectory, filepath);
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		log.warn(`Rejected collection path outside collections directory: ${collectionName}`);
		return null;
	}

	return filepath;
}

export function refersToSameCollectionPath(oldpath: string, newpath: string): boolean {
	if (oldpath === newpath) {
		return true;
	}

	if (!fs.existsSync(oldpath) || !fs.existsSync(newpath)) {
		return false;
	}

	try {
		return fs.realpathSync.native(oldpath) === fs.realpathSync.native(newpath);
	} catch (error) {
		log.error(`Failed to compare collection paths ${oldpath} and ${newpath}`);
		log.error(error);
		return false;
	}
}

export const readCollectionFileEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	collection: string
): Effect.fn.Return<ModCollection | null, Error> {
	const collectionPath = resolveCollectionFilePath(userDataPath, collection);
	if (!collectionPath) {
		return null;
	}

	const collectionExists = yield* fileExistsEffect(collectionPath);
	if (!collectionExists) {
		return null;
	}

	return yield* readJsonFileEffect<unknown>(collectionPath).pipe(
		Effect.flatMap((payload) =>
			Effect.try({
				try: () => {
					const data = parseStoredModCollectionPayload(ValidChannel.READ_COLLECTION, payload);
					return {
						name: collection,
						mods: [...data.mods]
					};
				},
				catch: (error) => error
			})
		),
		Effect.mapError((error) => {
			log.error(`Failed to read collection file ${collectionPath}`);
			log.error(error);
			return new Error(`Failed to load collection "${collection}"`);
		})
	);
});

export function readCollectionFile(userDataPath: string, collection: string): ModCollection | null {
	return Effect.runSync(readCollectionFileEffect(userDataPath, collection));
}

export const listCollectionsEffect = Effect.fnUntraced(function* (userDataPath: string): Effect.fn.Return<string[]> {
	const collectionsDirectory = yield* ensureCollectionsDirectoryEffect(userDataPath).pipe(
		Effect.catch(() => Effect.succeed(ensureCollectionsDirectory(userDataPath)))
	);
	const dirContents = yield* listDirectoryEffect(collectionsDirectory).pipe(
		Effect.catch((error) => {
			log.error(error.cause);
			return Effect.succeed([]);
		})
	);
	return dirContents.flatMap((entry) => {
		if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
			return [];
		}
		const collectionName = path.parse(entry.name).name;
		return validateCollectionName(collectionName) === undefined ? [collectionName] : [];
	});
});

export function listCollections(userDataPath: string): string[] {
	return Effect.runSync(listCollectionsEffect(userDataPath));
}

export const updateCollectionFileEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	collection: ModCollection
): Effect.fn.Return<boolean> {
	const filepath = resolveCollectionFilePath(userDataPath, collection.name);
	if (!filepath) {
		return false;
	}

	return yield* writeUtf8FileAtomicEffect(filepath, serializeCollectionFile(collection)).pipe(
		Effect.as(true),
		Effect.catch((error) => {
			log.error(error.cause);
			return Effect.succeed(false);
		})
	);
});

export function updateCollectionFile(userDataPath: string, collection: ModCollection): boolean {
	return Effect.runSync(updateCollectionFileEffect(userDataPath, collection));
}

export const renameCollectionFileEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	collection: ModCollection,
	newName: string
): Effect.fn.Return<boolean> {
	const oldpath = resolveCollectionFilePath(userDataPath, collection.name);
	const newpath = resolveCollectionFilePath(userDataPath, newName);
	if (!oldpath || !newpath) {
		return false;
	}

	log.info(`Renaming file ${oldpath} to ${newpath}`);
	const oldCollectionExists = yield* fileExistsEffect(oldpath).pipe(Effect.catch(() => Effect.succeed(false)));
	const newCollectionExists = yield* fileExistsEffect(newpath).pipe(Effect.catch(() => Effect.succeed(false)));
	const sameCollectionPath =
		oldCollectionExists &&
		newCollectionExists &&
		(yield* Effect.all([realpathEffect(oldpath), realpathEffect(newpath)]).pipe(
			Effect.map(([oldRealpath, newRealpath]) => oldRealpath === newRealpath),
			Effect.catch((error) => {
				log.error(`Failed to compare collection paths ${oldpath} and ${newpath}`);
				log.error(error.cause);
				return Effect.succeed(false);
			})
		));

	if (oldpath !== newpath && newCollectionExists && !sameCollectionPath) {
		log.warn(`Refusing to rename collection ${collection.name} because ${newName} already exists`);
		return false;
	}

	return yield* writeUtf8FileAtomicEffect(newpath, serializeCollectionFile(collection)).pipe(
		Effect.flatMap(() => {
			if (!oldCollectionExists || oldpath === newpath || sameCollectionPath) {
				return Effect.succeed(true);
			}
			return deleteFileEffect(oldpath).pipe(
				Effect.as(true),
				Effect.catch((error) =>
					deleteFileEffect(newpath).pipe(
						Effect.catch((rollbackError) =>
							Effect.sync(() => {
								log.error(`Failed to roll back rename for ${newpath}`);
								log.error(rollbackError.cause);
							})
						),
						Effect.flatMap(() => Effect.fail(error))
					)
				)
			);
		}),
		Effect.catch((error) => {
			log.error(error.cause);
			return Effect.succeed(false);
		})
	);
});

export function renameCollectionFile(userDataPath: string, collection: ModCollection, newName: string): boolean {
	return Effect.runSync(renameCollectionFileEffect(userDataPath, collection, newName));
}

export const deleteCollectionFileEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	collection: string
): Effect.fn.Return<boolean> {
	const filepath = resolveCollectionFilePath(userDataPath, collection);
	if (!filepath) {
		return false;
	}

	log.info(`Deleting file ${filepath}`);
	return yield* deleteFileEffect(filepath).pipe(
		Effect.as(true),
		Effect.catch((error) => {
			log.error(error.cause);
			return Effect.succeed(false);
		})
	);
});

export function deleteCollectionFile(userDataPath: string, collection: string): boolean {
	return Effect.runSync(deleteCollectionFileEffect(userDataPath, collection));
}
