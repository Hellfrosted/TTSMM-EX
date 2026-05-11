import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { ModCollection, ValidChannel } from '../model';
import { validateCollectionName } from '../shared/collection-name';
import { parseStoredModCollectionPayload } from './ipc/collection-validation';
import { ensureCollectionsDirectory, readJsonFile, writeUtf8FileAtomic } from './storage';

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

export function readCollectionFile(userDataPath: string, collection: string): ModCollection | null {
	const collectionPath = resolveCollectionFilePath(userDataPath, collection);
	if (!collectionPath) {
		return null;
	}

	if (!fs.existsSync(collectionPath)) {
		return null;
	}

	try {
		const data = parseStoredModCollectionPayload(ValidChannel.READ_COLLECTION, readJsonFile<unknown>(collectionPath));
		return {
			name: collection,
			mods: [...data.mods]
		};
	} catch (error) {
		log.error(`Failed to read collection file ${collectionPath}`);
		log.error(error);
		throw new Error(`Failed to load collection "${collection}"`);
	}
}

export function listCollections(userDataPath: string): string[] {
	const collectionsDirectory = ensureCollectionsDirectory(userDataPath);
	try {
		const dirContents = fs.readdirSync(collectionsDirectory, { withFileTypes: true });
		return dirContents.flatMap((entry) => {
			if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
				return [];
			}
			const collectionName = path.parse(entry.name).name;
			return validateCollectionName(collectionName) === undefined ? [collectionName] : [];
		});
	} catch (error) {
		log.error(error);
		return [];
	}
}

export function updateCollectionFile(userDataPath: string, collection: ModCollection): boolean {
	const filepath = resolveCollectionFilePath(userDataPath, collection.name);
	if (!filepath) {
		return false;
	}

	try {
		writeUtf8FileAtomic(filepath, serializeCollectionFile(collection));
		return true;
	} catch (error) {
		log.error(error);
		return false;
	}
}

export function renameCollectionFile(userDataPath: string, collection: ModCollection, newName: string): boolean {
	const oldpath = resolveCollectionFilePath(userDataPath, collection.name);
	const newpath = resolveCollectionFilePath(userDataPath, newName);
	if (!oldpath || !newpath) {
		return false;
	}

	log.info(`Renaming file ${oldpath} to ${newpath}`);
	try {
		const serializedCollection = serializeCollectionFile(collection);
		const oldCollectionExists = fs.existsSync(oldpath);
		const newCollectionExists = fs.existsSync(newpath);
		const sameCollectionPath = oldCollectionExists && newCollectionExists && refersToSameCollectionPath(oldpath, newpath);
		if (oldpath !== newpath && newCollectionExists && !sameCollectionPath) {
			log.warn(`Refusing to rename collection ${collection.name} because ${newName} already exists`);
			return false;
		}

		writeUtf8FileAtomic(newpath, serializedCollection);
		if (oldCollectionExists && oldpath !== newpath && !sameCollectionPath) {
			try {
				fs.unlinkSync(oldpath);
			} catch (error) {
				try {
					if (fs.existsSync(newpath)) {
						fs.unlinkSync(newpath);
					}
				} catch (rollbackError) {
					log.error(`Failed to roll back rename for ${newpath}`);
					log.error(rollbackError);
				}
				throw error;
			}
		}
		return true;
	} catch (error) {
		log.error(error);
		return false;
	}
}

export function deleteCollectionFile(userDataPath: string, collection: string): boolean {
	const filepath = resolveCollectionFilePath(userDataPath, collection);
	if (!filepath) {
		return false;
	}

	log.info(`Deleting file ${filepath}`);
	try {
		if (fs.existsSync(filepath)) {
			fs.unlinkSync(filepath);
		}
		return true;
	} catch (error) {
		log.error(error);
		return false;
	}
}
