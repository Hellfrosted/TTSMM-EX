import { Effect } from 'effect';
import log from 'electron-log';
import fs from 'fs';
import path from 'path';

export class MainStorageError extends Error {
	readonly _tag = 'MainStorageError';

	constructor(
		readonly operation: string,
		readonly filepath: string,
		readonly cause: unknown
	) {
		super(`Failed to ${operation} at ${filepath}`);
		this.name = 'MainStorageError';
	}
}

export function getCollectionsDirectory(userDataPath: string): string {
	return path.join(userDataPath, 'collections');
}

export function ensureCollectionsDirectoryEffect(userDataPath: string): Effect.Effect<string, MainStorageError> {
	const collectionsDirectory = getCollectionsDirectory(userDataPath);
	return Effect.try({
		try: () => {
			if (!fs.existsSync(collectionsDirectory)) {
				fs.mkdirSync(collectionsDirectory, { recursive: true });
			}
			return collectionsDirectory;
		},
		catch: (error) => new MainStorageError('ensure-collections-directory', collectionsDirectory, error)
	}).pipe(
		Effect.tapError((error) =>
			Effect.sync(() => {
				log.error(`Failed to ensure collections directory at ${collectionsDirectory}`);
				log.error(error.cause);
			})
		)
	);
}

export function ensureCollectionsDirectory(userDataPath: string): string {
	const collectionsDirectory = getCollectionsDirectory(userDataPath);
	Effect.runSync(
		ensureCollectionsDirectoryEffect(userDataPath).pipe(
			Effect.catch(() => {
				return Effect.succeed(collectionsDirectory);
			})
		)
	);
	return collectionsDirectory;
}

export function fileExistsEffect(filepath: string): Effect.Effect<boolean, MainStorageError> {
	return Effect.try({
		try: () => fs.existsSync(filepath),
		catch: (error) => new MainStorageError('file-exists', filepath, error)
	});
}

export function listDirectoryEffect(filepath: string): Effect.Effect<fs.Dirent[], MainStorageError> {
	return Effect.try({
		try: () => fs.readdirSync(filepath, { withFileTypes: true }),
		catch: (error) => new MainStorageError('list-directory', filepath, error)
	});
}

export function readJsonFileEffect<T>(filepath: string): Effect.Effect<T, MainStorageError> {
	return Effect.try({
		try: () => {
			const fileContents = fs.readFileSync(filepath, 'utf8');
			return JSON.parse(fileContents) as T;
		},
		catch: (error) => new MainStorageError('read-json-file', filepath, error)
	});
}

export function readJsonFile<T>(filepath: string): T {
	return Effect.runSync(readJsonFileEffect<T>(filepath));
}

function createAtomicWritePaths(filepath: string) {
	const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return {
		tempPath: `${filepath}.${suffix}.tmp`,
		backupPath: `${filepath}.${suffix}.bak`
	};
}

export function writeUtf8FileAtomicEffect(filepath: string, contents: string): Effect.Effect<void, MainStorageError> {
	return Effect.try({
		try: () => {
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
		},
		catch: (error) => new MainStorageError('atomic-write-utf8-file', filepath, error)
	});
}

export function writeUtf8FileAtomic(filepath: string, contents: string): void {
	Effect.runSync(writeUtf8FileAtomicEffect(filepath, contents));
}

export function deleteFileEffect(filepath: string): Effect.Effect<void, MainStorageError> {
	return Effect.try({
		try: () => {
			if (fs.existsSync(filepath)) {
				fs.unlinkSync(filepath);
			}
		},
		catch: (error) => new MainStorageError('delete-file', filepath, error)
	});
}

export function realpathEffect(filepath: string): Effect.Effect<string, MainStorageError> {
	return Effect.try({
		try: () => fs.realpathSync.native(filepath),
		catch: (error) => new MainStorageError('realpath', filepath, error)
	});
}

export function statEffect(filepath: string): Effect.Effect<fs.Stats, MainStorageError> {
	return Effect.try({
		try: () => fs.statSync(filepath),
		catch: (error) => new MainStorageError('stat', filepath, error)
	});
}
