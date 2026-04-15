import fs from 'fs';
import path from 'path';
import { app, IpcMain } from 'electron';
import log from 'electron-log';

import { ModCollection, ValidChannel } from '../../model';
import { validateCollectionName } from '../../shared/collection-name';
import { ensureCollectionsDirectory, readJsonFile } from '../storage';

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

export function readCollectionFile(userDataPath: string, collection: string): ModCollection | null {
	const collectionPath = resolveCollectionFilePath(userDataPath, collection);
	if (!collectionPath) {
		return null;
	}

	if (!fs.existsSync(collectionPath)) {
		return null;
	}

	try {
		const data = readJsonFile<ModCollection>(collectionPath);
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
			.map((entry) => path.basename(entry.name, '.json'))
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
		fs.writeFileSync(filepath, JSON.stringify({ ...collection, mods: [...collection.mods] }, null, 4), { encoding: 'utf8', flag: 'w' });
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
		if (fs.existsSync(oldpath)) {
			fs.renameSync(oldpath, newpath);
		}
		fs.writeFileSync(newpath, JSON.stringify(renamedCollection, null, 4), { encoding: 'utf8', flag: 'w' });
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

export function registerCollectionHandlers(ipcMain: IpcMain) {
	ipcMain.handle(ValidChannel.READ_COLLECTION, async (_event, collection: string) => {
		return readCollectionFile(app.getPath('userData'), collection);
	});

	ipcMain.handle(ValidChannel.READ_COLLECTIONS, async () => {
		return listCollections(app.getPath('userData'));
	});

	ipcMain.handle(ValidChannel.UPDATE_COLLECTION, async (_event, collection: ModCollection) => {
		return updateCollectionFile(app.getPath('userData'), collection);
	});

	ipcMain.handle(ValidChannel.RENAME_COLLECTION, async (_event, collection: ModCollection, newName: string) => {
		return renameCollectionFile(app.getPath('userData'), collection, newName);
	});

	ipcMain.handle(ValidChannel.DELETE_COLLECTION, async (_event, collection: string) => {
		return deleteCollectionFile(app.getPath('userData'), collection);
	});
}
