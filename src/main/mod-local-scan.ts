import log from 'electron-log';
import fs from 'fs';
import path from 'path';
import { ModData, ModType } from '../model';
import { registerPreviewImage } from './preview-protocol';
import type { ModInventoryProgress } from './mod-inventory-progress';

export const MAX_TTSMM_METADATA_BYTES = 1024 * 1024;

function isWorkshopPlaceholderName(name: string | undefined): boolean {
	return !!name && /^Workshop item \d+$/i.test(name.trim());
}

function toOptionalStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
	return filtered.length > 0 ? filtered : undefined;
}

function applyTtsmmMetadata(potentialMod: ModData, metadata: unknown) {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return;
	}

	const parsedMetadata = metadata as Record<string, unknown>;
	if (
		typeof parsedMetadata.name === 'string' &&
		parsedMetadata.name.trim().length > 0 &&
		(!potentialMod.name || isWorkshopPlaceholderName(potentialMod.name))
	) {
		potentialMod.name = parsedMetadata.name;
	}
	if (typeof parsedMetadata.description === 'string' && !potentialMod.description) {
		potentialMod.description = parsedMetadata.description;
	}

	const authors = toOptionalStringArray(parsedMetadata.authors);
	if (authors && (!potentialMod.authors || potentialMod.authors.length === 0)) {
		potentialMod.authors = authors;
	}

	const tags = toOptionalStringArray(parsedMetadata.tags);
	if (tags && (!potentialMod.tags || potentialMod.tags.length === 0)) {
		potentialMod.tags = tags;
	}

	const explicitIDDependencies = toOptionalStringArray(parsedMetadata.explicitIDDependencies);
	if (explicitIDDependencies) {
		potentialMod.explicitIDDependencies = explicitIDDependencies;
	}
}

function readTtsmmMetadataFile(metadataPath: string): string | null {
	let metadataFd: number;
	try {
		metadataFd = fs.openSync(metadataPath, 'r');
	} catch (error) {
		log.warn(`Skipping unreadable ttsmm metadata at ${metadataPath}`);
		log.warn(error);
		return null;
	}

	try {
		const stats = fs.fstatSync(metadataFd);
		if (!stats.isFile()) {
			log.warn(`Skipping non-file ttsmm metadata at ${metadataPath}`);
			return null;
		}
		if (stats.size > MAX_TTSMM_METADATA_BYTES) {
			log.warn(`Skipping oversized ttsmm metadata at ${metadataPath}`);
			return null;
		}

		const buffer = Buffer.alloc(stats.size);
		let bytesRead = 0;
		while (bytesRead < buffer.length) {
			const readCount = fs.readSync(metadataFd, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
			if (readCount === 0) {
				break;
			}
			bytesRead += readCount;
		}
		return buffer.subarray(0, bytesRead).toString('utf8');
	} catch (error) {
		log.warn(`Skipping unreadable ttsmm metadata at ${metadataPath}`);
		log.warn(error);
		return null;
	} finally {
		fs.closeSync(metadataFd);
	}
}

function applyTtsmmMetadataFile(potentialMod: ModData, metadataPath: string) {
	const metadataText = readTtsmmMetadataFile(metadataPath);
	if (metadataText === null) {
		return;
	}

	applyTtsmmMetadata(potentialMod, JSON.parse(metadataText));
}

export function createLocalPotentialMod(localPath: string, subDir: string): ModData {
	return {
		uid: `${ModType.LOCAL}:${subDir}`,
		id: null,
		type: ModType.LOCAL,
		hasCode: false,
		path: path.join(localPath, subDir)
	};
}

export async function getModDetailsFromPath(potentialMod: ModData, modPath: string, type: ModType): Promise<ModData | null> {
	log.debug(`Reading mod metadata for ${modPath}`);
	return new Promise((resolve, reject) => {
		fs.readdir(modPath, { withFileTypes: true }, async (err, files) => {
			try {
				if (err) {
					log.error(`fs.readdir failed on path ${modPath}`);
					log.error(err);
					reject(err);
				} else {
					let validModData = false;
					try {
						const stats = fs.statSync(modPath);
						potentialMod.lastUpdate = stats.mtime;
						if (!potentialMod.dateAdded) {
							potentialMod.dateAdded = stats.birthtime;
						}
					} catch (e) {
						log.error(`Failed to get file details for path ${modPath}`);
						log.error(e);
					}
					const fileSizes = files.map((file) => {
						let size = 0;
						if (file.isFile()) {
							try {
								const stats = fs.statSync(path.join(modPath, file.name));
								const { size: fileSize, mtime } = stats;
								size = fileSize;
								if (!potentialMod.lastUpdate || mtime > potentialMod.lastUpdate) {
									potentialMod.lastUpdate = mtime;
								}
							} catch {
								log.error(`Failed to get file details for ${file.name} under ${modPath}`);
							}
							if (file.name === 'preview.png' && !potentialMod.preview) {
								potentialMod.preview = registerPreviewImage(path.join(modPath, file.name));
							} else if (file.name.match(/^(.*)\.dll$/)) {
								potentialMod.hasCode = true;
							} else if (file.name === 'ttsmm.json') {
								applyTtsmmMetadataFile(potentialMod, path.join(modPath, file.name));
							} else {
								const matches = file.name.match(/^(.*)_bundle$/);
								if (matches && matches.length > 1) {
									const [, modId] = matches;
									potentialMod.id = modId;
									if (type !== ModType.WORKSHOP) {
										potentialMod.uid = `${type}:${potentialMod.id}`;
									}
									if (!potentialMod.name || isWorkshopPlaceholderName(potentialMod.name)) {
										potentialMod.name = modId;
									}
									potentialMod.path = modPath;
									validModData = true;
								}
								log.silly(`Found file: ${file.name} under mod path ${modPath}`);
							}
						}
						return size;
					});

					if (validModData) {
						potentialMod.size = fileSizes.reduce((acc: number, curr: number) => acc + curr, 0);
						resolve(potentialMod);
					} else {
						log.warn(`Marking potential mod at ${modPath} as invalid mod`);
						resolve(null);
					}
				}
			} catch (e) {
				log.error(`Failed to get local mod details at ${modPath}:`);
				log.error(e);
				reject(e);
			}
		});
	});
}

export async function scanLocalMods(localPath: string | undefined, progress: ModInventoryProgress): Promise<ModData[]> {
	let localModDirs: string[] = [];
	if (localPath) {
		try {
			localModDirs = fs
				.readdirSync(localPath, { withFileTypes: true })
				.filter((dirent) => dirent.isDirectory())
				.map((dirent) => dirent.name);
			progress.localMods = localModDirs.length;
		} catch {
			log.error(`Failed to read local mods in ${localModDirs}`);
		}
	}

	const modResponses = await Promise.allSettled<ModData | null>(
		localModDirs.map((subDir: string) => {
			const potentialMod = createLocalPotentialMod(localPath!, subDir);
			return getModDetailsFromPath(potentialMod, potentialMod.path!, ModType.LOCAL).finally(() => {
				progress.addLoaded(1);
			});
		})
	);
	return modResponses
		.filter((result): result is PromiseFulfilledResult<ModData> => result.status === 'fulfilled' && !!result.value)
		.map((result) => result.value);
}
