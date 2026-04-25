import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { IpcMain } from 'electron';
import log from 'electron-log';

import { ModCollection, ValidChannel } from '../../model';
import { validateCollectionName } from '../../shared/collection-name';
import { ensureCollectionsDirectory, readJsonFile, writeUtf8FileAtomic } from '../storage';
import { parseCollectionNamePayload, parseModCollectionPayload } from './collection-validation';
import { assertValidIpcSender } from './ipc-sender-validation';

interface UserDataPathProvider {
	getUserDataPath: () => string;
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
		const data = parseModCollectionPayload(ValidChannel.READ_COLLECTION, readJsonFile<unknown>(collectionPath));
		data.name = collection;
		return data;
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
		return dirContents
			.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
			.map((entry) => path.parse(entry.name).name)
			.filter((collectionName) => validateCollectionName(collectionName) === undefined);
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
		writeUtf8FileAtomic(filepath, JSON.stringify({ ...collection, mods: [...collection.mods] }, null, 4));
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
		const renamedCollection: ModCollection = {
			...collection,
			name: newName,
			mods: [...collection.mods]
		};
		const serializedCollection = JSON.stringify(renamedCollection, null, 4);
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

function deleteCollectionFile(userDataPath: string, collection: string): boolean {
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

export function registerCollectionHandlers(
	ipcMain: IpcMain,
	userDataPathProvider: UserDataPathProvider = {
		getUserDataPath: () => app.getPath('userData')
	}
) {
	const getUserDataPath = () => userDataPathProvider.getUserDataPath();

	ipcMain.handle(ValidChannel.READ_COLLECTION, async (event, collection: string) => {
		assertValidIpcSender(ValidChannel.READ_COLLECTION, event);
		return readCollectionFile(getUserDataPath(), parseCollectionNamePayload(ValidChannel.READ_COLLECTION, collection));
	});

	ipcMain.handle(ValidChannel.READ_COLLECTIONS, async (event) => {
		assertValidIpcSender(ValidChannel.READ_COLLECTIONS, event);
		return listCollections(getUserDataPath());
	});

	ipcMain.handle(ValidChannel.UPDATE_COLLECTION, async (event, collection: ModCollection) => {
		assertValidIpcSender(ValidChannel.UPDATE_COLLECTION, event);
		return updateCollectionFile(getUserDataPath(), parseModCollectionPayload(ValidChannel.UPDATE_COLLECTION, collection));
	});

	ipcMain.handle(ValidChannel.RENAME_COLLECTION, async (event, collection: ModCollection, newName: string) => {
		assertValidIpcSender(ValidChannel.RENAME_COLLECTION, event);
		return renameCollectionFile(
			getUserDataPath(),
			parseModCollectionPayload(ValidChannel.RENAME_COLLECTION, collection),
			parseCollectionNamePayload(ValidChannel.RENAME_COLLECTION, newName)
		);
	});

	ipcMain.handle(ValidChannel.DELETE_COLLECTION, async (event, collection: string) => {
		assertValidIpcSender(ValidChannel.DELETE_COLLECTION, event);
		return deleteCollectionFile(getUserDataPath(), parseCollectionNamePayload(ValidChannel.DELETE_COLLECTION, collection));
	});
}
