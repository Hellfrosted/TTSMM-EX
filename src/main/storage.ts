import fs from 'fs';
import path from 'path';
import log from 'electron-log';

export function getCollectionsDirectory(userDataPath: string): string {
	return path.join(userDataPath, 'collections');
}

export function ensureCollectionsDirectory(userDataPath: string): string {
	const collectionsDirectory = getCollectionsDirectory(userDataPath);
	try {
		if (!fs.existsSync(collectionsDirectory)) {
			fs.mkdirSync(collectionsDirectory, { recursive: true });
		}
	} catch (error) {
		log.error(`Failed to ensure collections directory at ${collectionsDirectory}`);
		log.error(error);
	}
	return collectionsDirectory;
}

export function readJsonFile<T>(filepath: string): T {
	const fileContents = fs.readFileSync(filepath, 'utf8');
	return JSON.parse(fileContents) as T;
}
