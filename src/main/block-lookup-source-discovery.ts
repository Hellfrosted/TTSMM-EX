import childProcess from 'child_process';
import fs from 'fs';
import os from 'node:os';
import path from 'path';
import log from 'electron-log';
import type { BlockLookupBuildRequest, BlockLookupModSource, BlockLookupSourceKind } from 'shared/block-lookup';
import { TERRATECH_STEAM_APP_ID } from 'shared/block-lookup';
import { expandUserPath, normalizePathValue, parseSteamLibraryFolders } from './path-utils';

const JSON_SUFFIXES = new Set(['.json']);
const IGNORE_SUFFIXES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.txt', '.xml', '.meta', '.ini', '.md', '.tdc']);
const IGNORE_FILENAMES = new Set(['SteamVersion']);

export interface BlockLookupSourceRecord {
	workshopId: string;
	modTitle: string;
	sourceKind: BlockLookupSourceKind;
	sourcePath: string;
	size: number;
	mtimeMs: number;
}

function getWindowsSteamPathFromRegistry(execFileSync: typeof childProcess.execFileSync = childProcess.execFileSync): string | null {
	try {
		const output = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
			encoding: 'utf8'
		});
		const match = output.match(/SteamPath\s+REG_\w+\s+(.+)$/m);
		return normalizePathValue(match?.[1]);
	} catch {
		return null;
	}
}

function getCommonSteamLocationCandidates(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env) {
	const candidates = new Set<string>();
	const addCandidate = (candidate: string | null | undefined) => {
		const normalized = normalizePathValue(candidate);
		if (normalized) {
			candidates.add(normalized);
		}
	};

	if (platform === 'win32') {
		addCandidate(getWindowsSteamPathFromRegistry());
		[env['ProgramFiles(x86)'], env['PROGRAMFILES(X86)'], env.ProgramFiles, env.PROGRAMFILES].forEach((basePath) => {
			if (basePath) {
				addCandidate(path.join(basePath, 'Steam'));
			}
		});

		for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
			const driveRoot = `${letter}:\\`;
			if (!fs.existsSync(driveRoot)) {
				continue;
			}
			addCandidate(path.join(driveRoot, 'Steam'));
			addCandidate(path.join(driveRoot, 'SteamLibrary'));
			addCandidate(path.join(driveRoot, 'Program Files', 'Steam'));
			addCandidate(path.join(driveRoot, 'Program Files (x86)', 'Steam'));
		}
		return [...candidates];
	}

	addCandidate(path.join(os.homedir(), '.steam', 'steam'));
	addCandidate(path.join(os.homedir(), '.local', 'share', 'Steam'));
	return [...candidates];
}

function findSteamLibraryPaths(platform: NodeJS.Platform = process.platform): string[] {
	const libraries = new Set<string>();
	const addLibrary = (libraryPath: string | null | undefined) => {
		const normalized = normalizePathValue(libraryPath);
		if (normalized && fs.existsSync(normalized)) {
			libraries.add(normalized);
		}
	};

	getCommonSteamLocationCandidates(platform).forEach((steamDir) => {
		addLibrary(steamDir);
		for (const vdfPath of [path.join(steamDir, 'config', 'libraryfolders.vdf'), path.join(steamDir, 'steamapps', 'libraryfolders.vdf')]) {
			if (!fs.existsSync(vdfPath)) {
				continue;
			}
			try {
				parseSteamLibraryFolders(fs.readFileSync(vdfPath, 'utf8')).forEach(addLibrary);
			} catch (error) {
				log.warn(`Failed to read Steam library folders from ${vdfPath}`);
				log.warn(error);
			}
		}
	});

	return [...libraries];
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

function deriveWorkshopRootFromGameExec(gameExec: string | null | undefined): string | null {
	const gameRoot = findGameRootFromGameExec(gameExec);
	if (!gameRoot) {
		return null;
	}

	const match = gameRoot.match(/^(.*?)[\\/]steamapps[\\/]common[\\/]TerraTech$/i);
	if (!match?.[1]) {
		return null;
	}

	const workshopRoot = path.join(match[1], 'steamapps', 'workshop', 'content', TERRATECH_STEAM_APP_ID);
	return fs.existsSync(workshopRoot) ? path.normalize(workshopRoot) : null;
}

export function autoDetectBlockLookupWorkshopRoot(
	request: Pick<BlockLookupBuildRequest, 'gameExec' | 'modSources' | 'workshopRoot'> = {}
): string | null {
	const configuredRoot = normalizeWorkshopRoot(request.workshopRoot);
	if (looksLikeWorkshopRoot(configuredRoot)) {
		return configuredRoot;
	}

	for (const modSource of request.modSources || []) {
		const root = deriveWorkshopRootFromPath(modSource.path);
		if (looksLikeWorkshopRoot(root)) {
			return root;
		}
	}

	const gameExecRoot = deriveWorkshopRootFromGameExec(request.gameExec);
	if (looksLikeWorkshopRoot(gameExecRoot)) {
		return gameExecRoot;
	}

	for (const libraryPath of findSteamLibraryPaths()) {
		const root = path.join(libraryPath, 'steamapps', 'workshop', 'content', TERRATECH_STEAM_APP_ID);
		if (looksLikeWorkshopRoot(root)) {
			return path.normalize(root);
		}
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
	const jsonRoot = fs.existsSync(blockJsonDir) && fs.statSync(blockJsonDir).isDirectory() ? blockJsonDir : modDir;
	const visitJson = (directory: string) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const childPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				visitJson(childPath);
				continue;
			}
			if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
				addSourceRecord(sourceMap, createSourceRecord(childPath, 'json', workshopId, modTitle));
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

	const workshopRoot = autoDetectBlockLookupWorkshopRoot(request) || normalizeWorkshopRoot(request.workshopRoot) || '';
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
