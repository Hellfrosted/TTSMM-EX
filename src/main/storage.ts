import fs from 'fs';
import path from 'path';
import log from 'electron-log';

function getCollectionsDirectory(userDataPath: string): string {
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

function createAtomicWritePaths(filepath: string) {
	const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return {
		tempPath: `${filepath}.${suffix}.tmp`,
		backupPath: `${filepath}.${suffix}.bak`
	};
}

export function writeUtf8FileAtomic(filepath: string, contents: string): void {
	fs.mkdirSync(path.dirname(filepath), { recursive: true });

	const { tempPath, backupPath } = createAtomicWritePaths(filepath);
	const hadOriginalFile = fs.existsSync(filepath);

	try {
		fs.writeFileSync(tempPath, contents, { encoding: 'utf8', flag: 'wx' });

		if (!hadOriginalFile) {
			fs.renameSync(tempPath, filepath);
			return;
		}

		fs.renameSync(filepath, backupPath);
		try {
			fs.renameSync(tempPath, filepath);
		} catch (error) {
			if (fs.existsSync(backupPath) && !fs.existsSync(filepath)) {
				fs.renameSync(backupPath, filepath);
			}
			throw error;
		}

		fs.unlinkSync(backupPath);
	} catch (error) {
		if (fs.existsSync(tempPath)) {
			try {
				fs.unlinkSync(tempPath);
			} catch (cleanupError) {
				log.error(`Failed to clean up temp file ${tempPath}`);
				log.error(cleanupError);
			}
		}
		throw error;
	}
}
