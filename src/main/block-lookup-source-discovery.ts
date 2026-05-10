import fs from 'fs';
import path from 'path';
import type { BlockLookupBuildRequest, BlockLookupModSource, BlockLookupSourceKind } from 'shared/block-lookup';
import { TERRATECH_STEAM_APP_ID } from 'shared/block-lookup';
import { expandUserPath, normalizePathValue } from './path-utils';
import Steamworks from './steamworks';

const JSON_SUFFIXES = new Set(['.json']);
const IGNORE_SUFFIXES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.txt', '.xml', '.meta', '.ini', '.md', '.tdc']);
const IGNORE_FILENAMES = new Set(['SteamVersion']);
export const MAX_BLOCK_LOOKUP_JSON_DEPTH = 32;
const MAX_BLOCK_LOOKUP_JSON_SOURCES_PER_MOD = 5_000;

export interface BlockLookupSourceRecord {
	workshopId: string;
	modTitle: string;
	sourceKind: BlockLookupSourceKind;
	sourcePath: string;
	size: number;
	mtimeMs: number;
}

export function normalizeWorkshopRoot(value: string | null | undefined): string | null {
	const normalized = expandUserPath(value);
	if (!normalized) {
		return null;
	}

	const candidates = [
		normalized,
		path.join(normalized, 'steamapps', 'workshop', 'content', TERRATECH_STEAM_APP_ID),
		path.join(normalized, 'workshop', 'content', TERRATECH_STEAM_APP_ID),
		path.join(normalized, 'content', TERRATECH_STEAM_APP_ID)
	];
	const existingCandidate = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
	return path.normalize(existingCandidate || normalized);
}

function looksLikeWorkshopRoot(value: string | null | undefined): boolean {
	const normalized = normalizeWorkshopRoot(value);
	if (!normalized || !fs.existsSync(normalized)) {
		return false;
	}

	try {
		const stats = fs.statSync(normalized);
		return (
			stats.isDirectory() &&
			path.basename(normalized) === TERRATECH_STEAM_APP_ID &&
			fs.readdirSync(normalized, { withFileTypes: true }).some((entry) => entry.isDirectory())
		);
	} catch {
		return false;
	}
}

function deriveWorkshopRootFromPath(value: string | null | undefined): string | null {
	const normalized = normalizePathValue(value);
	if (!normalized) {
		return null;
	}

	const match = normalized.match(
		new RegExp(`^(.*?[\\\\/]steamapps[\\\\/]workshop[\\\\/]content[\\\\/]${TERRATECH_STEAM_APP_ID})(?:[\\\\/].*)?$`, 'i')
	);
	return match?.[1] ? path.normalize(match[1]) : null;
}

function parseWorkshopId(value: string | null | undefined): bigint | null {
	if (!value?.trim() || !/^\d+$/.test(value.trim())) {
		return null;
	}

	return BigInt(value.trim());
}

function findGameRootFromGameExec(gameExec: string | null | undefined): string | null {
	const normalized = expandUserPath(gameExec);
	if (!normalized) {
		return null;
	}

	const candidates = [];
	if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
		candidates.push(normalized);
	} else {
		candidates.push(path.dirname(normalized));
	}
	candidates.push(normalized);

	return (
		candidates.find((candidate) => fs.existsSync(path.join(candidate, 'TerraTechWin64_Data', 'Managed', 'Assembly-CSharp.dll'))) || null
	);
}

function deriveWorkshopRootFromSteamAppInstallDir(appInstallDir: string | null | undefined): string | null {
	const normalized = normalizePathValue(appInstallDir);
	if (!normalized) {
		return null;
	}

	const match = normalized.match(/^(.*?)[\\/]steamapps[\\/]common[\\/]TerraTech$/i);
	if (!match?.[1]) {
		return null;
	}

	const workshopRoot = path.join(match[1], 'steamapps', 'workshop', 'content', TERRATECH_STEAM_APP_ID);
	return looksLikeWorkshopRoot(workshopRoot) ? path.normalize(workshopRoot) : null;
}

function deriveWorkshopRootFromGameExec(gameExec: string | null | undefined): string | null {
	const gameRoot = findGameRootFromGameExec(gameExec);
	return deriveWorkshopRootFromSteamAppInstallDir(gameRoot);
}

function deriveWorkshopRootFromSteamWorkshopId(workshopId: bigint): string | null {
	let installInfo: ReturnType<typeof Steamworks.ugcGetItemInstallInfo>;
	try {
		installInfo = Steamworks.ugcGetItemInstallInfo(workshopId);
	} catch {
		return null;
	}
	if (!installInfo?.folder) {
		return null;
	}

	const workshopRoot = deriveWorkshopRootFromPath(installInfo.folder);
	return looksLikeWorkshopRoot(workshopRoot) ? workshopRoot : null;
}

export function autoDetectBlockLookupWorkshopRoot(
	request: Pick<BlockLookupBuildRequest, 'gameExec' | 'modSources' | 'workshopRoot'> = {}
): string | null {
	const configuredRoot = normalizeWorkshopRoot(request.workshopRoot);
	if (looksLikeWorkshopRoot(configuredRoot)) {
		return configuredRoot;
	}

	for (const modSource of request.modSources || []) {
		const pathRoot = deriveWorkshopRootFromPath(modSource.path);
		if (looksLikeWorkshopRoot(pathRoot)) {
			return pathRoot;
		}

		const workshopId = parseWorkshopId(modSource.workshopID) ?? parseWorkshopId(modSource.uid.replace(/^workshop:/i, ''));
		if (!workshopId) {
			continue;
		}

		const root = deriveWorkshopRootFromSteamWorkshopId(workshopId);
		if (root) {
			return root;
		}
	}

	try {
		for (const workshopId of Steamworks.getSubscribedItems()) {
			const root = deriveWorkshopRootFromSteamWorkshopId(workshopId);
			if (root) {
				return root;
			}
		}
	} catch {
		// Steamworks probing is opportunistic; callers can still fall back to configured paths.
	}

	let appInstallDir = '';
	try {
		appInstallDir = Steamworks.getAppInstallDir(Number(TERRATECH_STEAM_APP_ID));
	} catch {
		appInstallDir = '';
	}
	const steamAppInstallRoot = deriveWorkshopRootFromSteamAppInstallDir(appInstallDir);
	if (steamAppInstallRoot) {
		return steamAppInstallRoot;
	}

	const gameExecRoot = deriveWorkshopRootFromGameExec(request.gameExec);
	if (gameExecRoot) {
		return gameExecRoot;
	}

	return null;
}

function isBundleCandidate(filepath: string): boolean {
	const filename = path.basename(filepath);
	if (IGNORE_FILENAMES.has(filename)) {
		return false;
	}
	const suffix = path.extname(filepath).toLowerCase();
	if (IGNORE_SUFFIXES.has(suffix) || JSON_SUFFIXES.has(suffix)) {
		return false;
	}
	return filename.endsWith('_bundle') || suffix === '';
}

function deriveModTitle(modDir: string, bundles: string[], modSource?: BlockLookupModSource): string {
	if (modSource?.name?.trim()) {
		return modSource.name.trim();
	}
	if (modSource?.id?.trim()) {
		return modSource.id.trim();
	}
	if (bundles.length > 0) {
		const stem = path.basename(bundles[0]).replace(/_bundle$/i, '');
		if (stem) {
			return stem;
		}
	}
	return path.basename(modDir);
}

function createSourceRecord(
	sourcePath: string,
	sourceKind: BlockLookupSourceKind,
	workshopId: string,
	modTitle: string
): BlockLookupSourceRecord {
	const stats = fs.statSync(sourcePath);
	return {
		sourcePath: path.normalize(sourcePath),
		sourceKind,
		workshopId,
		modTitle,
		size: stats.size,
		mtimeMs: stats.mtimeMs
	};
}

function addSourceRecord(sourceMap: Map<string, BlockLookupSourceRecord>, source: BlockLookupSourceRecord) {
	if (!sourceMap.has(source.sourcePath)) {
		sourceMap.set(source.sourcePath, source);
	}
}

function isPathInsideDirectory(parentDirectory: string, candidatePath: string) {
	const relativePath = path.relative(parentDirectory, candidatePath);
	return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveContainedDirectory(candidatePath: string, parentDirectory: string): string | null {
	if (!fs.existsSync(candidatePath)) {
		return null;
	}

	try {
		const candidateStats = fs.statSync(candidatePath);
		if (!candidateStats.isDirectory()) {
			return null;
		}

		const realParent = fs.realpathSync(parentDirectory);
		const realCandidate = fs.realpathSync(candidatePath);
		if (!isPathInsideDirectory(realParent, realCandidate)) {
			return null;
		}

		return candidatePath;
	} catch {
		return null;
	}
}

function addModDirectorySources(sourceMap: Map<string, BlockLookupSourceRecord>, modDir: string, modSource?: BlockLookupModSource) {
	if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) {
		return;
	}

	const entries = fs.readdirSync(modDir, { withFileTypes: true });
	const bundles = entries
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(modDir, entry.name))
		.filter(isBundleCandidate);
	const workshopId = modSource?.workshopID || (/^\d+$/.test(path.basename(modDir)) ? path.basename(modDir) : modSource?.uid || 'local');
	const modTitle = deriveModTitle(modDir, bundles, modSource);

	bundles.forEach((bundlePath) => {
		addSourceRecord(sourceMap, createSourceRecord(bundlePath, 'bundle', workshopId, modTitle));
	});

	const blockJsonDir = path.join(modDir, 'BlockJSON');
	const jsonRoot = resolveContainedDirectory(blockJsonDir, modDir) ?? modDir;
	let jsonSourcesForMod = 0;
	const visitJson = (directory: string, depth = 0) => {
		if (depth > MAX_BLOCK_LOOKUP_JSON_DEPTH || jsonSourcesForMod >= MAX_BLOCK_LOOKUP_JSON_SOURCES_PER_MOD) {
			return;
		}

		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (jsonSourcesForMod >= MAX_BLOCK_LOOKUP_JSON_SOURCES_PER_MOD) {
				return;
			}

			const childPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				const containedChildPath = resolveContainedDirectory(childPath, modDir);
				if (containedChildPath) {
					visitJson(containedChildPath, depth + 1);
				}
				continue;
			}
			if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
				addSourceRecord(sourceMap, createSourceRecord(childPath, 'json', workshopId, modTitle));
				jsonSourcesForMod += 1;
			}
		}
	};
	visitJson(jsonRoot);
}

function findVanillaAssemblyPath(gameExec: string | null | undefined): string | null {
	const gameRoot = findGameRootFromGameExec(gameExec);
	if (!gameRoot) {
		return null;
	}

	const assemblyPath = path.join(gameRoot, 'TerraTechWin64_Data', 'Managed', 'Assembly-CSharp.dll');
	return fs.existsSync(assemblyPath) ? assemblyPath : null;
}

export function collectBlockLookupSources(request: BlockLookupBuildRequest): { sources: BlockLookupSourceRecord[]; workshopRoot: string } {
	const sourceMap = new Map<string, BlockLookupSourceRecord>();

	(request.modSources || []).forEach((modSource) => {
		const modPath = normalizePathValue(modSource.path);
		if (modPath) {
			addModDirectorySources(sourceMap, modPath, modSource);
		}
	});

	const configuredRoot = normalizeWorkshopRoot(request.workshopRoot);
	const workshopRoot =
		(looksLikeWorkshopRoot(configuredRoot) ? configuredRoot : autoDetectBlockLookupWorkshopRoot(request)) || configuredRoot || '';
	if (looksLikeWorkshopRoot(workshopRoot)) {
		for (const entry of fs.readdirSync(workshopRoot, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				addModDirectorySources(sourceMap, path.join(workshopRoot, entry.name));
			}
		}
	}

	const vanillaAssemblyPath = findVanillaAssemblyPath(request.gameExec);
	if (vanillaAssemblyPath) {
		sourceMap.set(path.normalize(vanillaAssemblyPath), createSourceRecord(vanillaAssemblyPath, 'vanilla', 'vanilla', 'Vanilla TerraTech'));
	}

	return {
		sources: [...sourceMap.values()].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
		workshopRoot
	};
}
