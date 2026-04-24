import childProcess from 'child_process';
import fs from 'fs';
import os from 'node:os';
import path from 'path';
import log from 'electron-log';
import {
	BLOCK_LOOKUP_INDEX_VERSION,
	BlockLookupBuildRequest,
	BlockLookupIndexSource,
	BlockLookupIndexStats,
	BlockLookupModSource,
	BlockLookupRecord,
	BlockLookupSearchResult,
	BlockLookupSettings,
	BlockLookupSourceKind,
	PersistedBlockLookupIndex,
	TERRATECH_STEAM_APP_ID
} from 'shared/block-lookup';
import { writeUtf8FileAtomic } from './storage';
import { expandUserPath, normalizePathValue } from './path-utils';

const BLOCK_LOOKUP_INDEX_FILENAME = 'block-lookup-index.json';
const BLOCK_LOOKUP_SETTINGS_FILENAME = 'block-lookup-settings.json';
const NAME_RE = /"Name"\s*:\s*"([^"]+)"/i;
const ID_RE = /"ID"\s*:\s*(\d+)/i;
const UNITY_NAME_RE = /"m_Name"\s*:\s*"([^"]+)"/i;
const LIBRARY_PATH_RE = /"path"\s+"([^"]+)"/g;
const JSON_SUFFIXES = new Set(['.json']);
const IGNORE_SUFFIXES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.txt', '.xml', '.meta', '.ini', '.md', '.tdc']);
const IGNORE_FILENAMES = new Set(['SteamVersion']);
const BUNDLE_SCAN_CONTEXT_CHARS = 8192;
const PYTHON_BUNDLE_EXTRACT_SCRIPT = String.raw`
import json
import re
import sys

NAME_RE = re.compile(r'"Name"\s*:\s*"([^"]+)"')
ID_RE = re.compile(r'"ID"\s*:\s*(\d+)')

try:
    import UnityPy
except ModuleNotFoundError as exc:
    print(json.dumps({"available": False, "error": str(exc), "results": {}}))
    raise SystemExit(0)

def parse_block(text, internal_name):
    name_match = NAME_RE.search(text)
    if not name_match:
        return None
    id_match = ID_RE.search(text)
    return {
        "blockName": name_match.group(1),
        "blockId": id_match.group(1) if id_match else "",
        "internalName": internal_name or name_match.group(1),
    }

payload = json.loads(sys.stdin.read() or "[]")
results = {}
for source_path in payload:
    blocks = []
    seen = set()
    try:
        env = UnityPy.load(source_path)
        for obj in env.objects:
            if obj.type.name != "TextAsset":
                continue
            data = obj.read()
            internal_name = getattr(data, "m_Name", "") or ""
            text = getattr(data, "m_Script", b"")
            if isinstance(text, bytes):
                text = text.decode("utf-8", errors="replace")
            if "NuterraBlock" not in text:
                continue
            parsed = parse_block(text, internal_name)
            if not parsed:
                continue
            key = (parsed["blockName"], parsed["blockId"], parsed["internalName"])
            if key in seen:
                continue
            seen.add(key)
            blocks.append(parsed)
    except Exception:
        blocks = []
    results[source_path] = blocks

print(json.dumps({"available": True, "results": results}))
`;

interface SourceRecord {
	workshopId: string;
	modTitle: string;
	sourceKind: BlockLookupSourceKind;
	sourcePath: string;
	size: number;
	mtimeMs: number;
}

interface ExtractedTextBlock {
	blockName: string;
	blockId: string;
	internalName: string;
}

interface PythonBundleExtractResult {
	available: boolean;
	results: Record<string, ExtractedTextBlock[]>;
	error?: string;
}

function getBlockLookupIndexPath(userDataPath: string) {
	return path.join(userDataPath, BLOCK_LOOKUP_INDEX_FILENAME);
}

function getBlockLookupSettingsPath(userDataPath: string) {
	return path.join(userDataPath, BLOCK_LOOKUP_SETTINGS_FILENAME);
}

function readJsonFile<T>(filepath: string): T | null {
	if (!fs.existsSync(filepath)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(filepath, 'utf8')) as T;
	} catch (error) {
		log.warn(`Failed to read JSON file ${filepath}`);
		log.warn(error);
		return null;
	}
}

function writeJsonFile(filepath: string, value: unknown) {
	writeUtf8FileAtomic(filepath, JSON.stringify(value, null, 2));
}

export function readBlockLookupSettings(userDataPath: string): BlockLookupSettings {
	const settings = readJsonFile<Partial<BlockLookupSettings>>(getBlockLookupSettingsPath(userDataPath));
	return {
		workshopRoot: typeof settings?.workshopRoot === 'string' ? settings.workshopRoot : ''
	};
}

export function writeBlockLookupSettings(userDataPath: string, settings: BlockLookupSettings): BlockLookupSettings {
	const normalizedSettings: BlockLookupSettings = {
		workshopRoot: normalizeWorkshopRoot(settings.workshopRoot) || settings.workshopRoot.trim()
	};
	writeJsonFile(getBlockLookupSettingsPath(userDataPath), normalizedSettings);
	return normalizedSettings;
}

function createEmptyIndex(): PersistedBlockLookupIndex {
	return {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: '',
		sources: [],
		records: []
	};
}

export function readBlockLookupIndex(userDataPath: string): PersistedBlockLookupIndex {
	const index = readJsonFile<PersistedBlockLookupIndex>(getBlockLookupIndexPath(userDataPath));
	if (!index || index.version !== BLOCK_LOOKUP_INDEX_VERSION || !Array.isArray(index.sources) || !Array.isArray(index.records)) {
		return createEmptyIndex();
	}

	return index;
}

function writeBlockLookupIndex(userDataPath: string, index: PersistedBlockLookupIndex) {
	writeJsonFile(getBlockLookupIndexPath(userDataPath), index);
}

function observedNormalize(value: string): string {
	const placeholder = '<<DASHSEP>>';
	return value
		.replace(/ - /g, placeholder)
		.replace(/-/g, '_')
		.trim()
		.replace(/\s+/g, '_')
		.replace(new RegExp(placeholder, 'g'), '_-_');
}

function strictNormalize(value: string): string {
	return value.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizedLookupKey(value: string): string {
	return value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
}

function humanizeIdentifier(value: string): string {
	return value
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildBlockLookupAliases(blockName: string, modTitle: string): { preferredAlias: string; fallbackAlias: string } {
	return {
		preferredAlias: `${observedNormalize(blockName)}(${observedNormalize(modTitle)})`,
		fallbackAlias: `${strictNormalize(blockName)}(${strictNormalize(modTitle)})`
	};
}

function createBlockLookupRecord(
	source: SourceRecord,
	block: ExtractedTextBlock,
	aliases = buildBlockLookupAliases(block.blockName, source.modTitle)
): BlockLookupRecord {
	return {
		blockName: block.blockName,
		internalName: block.internalName,
		blockId: block.blockId,
		modTitle: source.modTitle,
		workshopId: source.workshopId,
		sourceKind: source.sourceKind,
		sourcePath: source.sourcePath,
		preferredAlias: aliases.preferredAlias,
		fallbackAlias: aliases.fallbackAlias,
		spawnCommand: `SpawnBlock ${aliases.preferredAlias}`,
		fallbackSpawnCommand: `SpawnBlock ${aliases.fallbackAlias}`
	};
}

function parseNuterraBlockText(text: string, fallbackInternalName: string): ExtractedTextBlock | null {
	const name = NAME_RE.exec(text)?.[1]?.trim();
	if (!name) {
		return null;
	}

	return {
		blockName: name,
		blockId: ID_RE.exec(text)?.[1] || '',
		internalName: UNITY_NAME_RE.exec(text)?.[1]?.trim() || fallbackInternalName
	};
}

export function extractNuterraBlocksFromText(text: string, fallbackInternalName: string): ExtractedTextBlock[] {
	if (!text.includes('NuterraBlock')) {
		return [];
	}

	const records: ExtractedTextBlock[] = [];
	const seen = new Set<string>();
	let cursor = 0;
	while (cursor < text.length) {
		const index = text.indexOf('NuterraBlock', cursor);
		if (index < 0) {
			break;
		}

		const start = Math.max(0, index - BUNDLE_SCAN_CONTEXT_CHARS);
		const end = Math.min(text.length, index + BUNDLE_SCAN_CONTEXT_CHARS);
		const parsed = parseNuterraBlockText(text.slice(start, end), fallbackInternalName);
		if (parsed) {
			const key = `${normalizedLookupKey(parsed.blockName)}:${parsed.blockId}:${parsed.internalName}`;
			if (!seen.has(key)) {
				seen.add(key);
				records.push(parsed);
			}
		}
		cursor = index + 'NuterraBlock'.length;
	}

	return records;
}

function isExtractedTextBlock(value: unknown): value is ExtractedTextBlock {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const record = value as ExtractedTextBlock;
	return typeof record.blockName === 'string' && typeof record.blockId === 'string' && typeof record.internalName === 'string';
}

function extractBundleBlocksWithPython(sourcePaths: string[], execFile: typeof childProcess.execFile = childProcess.execFile): Promise<Map<string, ExtractedTextBlock[]> | null> {
	if (sourcePaths.length === 0) {
		return Promise.resolve(new Map());
	}

	return new Promise((resolve) => {
		const child = execFile(
			'python',
			['-c', PYTHON_BUNDLE_EXTRACT_SCRIPT],
			{
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
				timeout: 180000
			},
			(error, stdout) => {
				if (error) {
					log.warn('Python/UnityPy block bundle extraction is unavailable; falling back to raw bundle text scan.');
					log.warn(error);
					resolve(null);
					return;
				}

				try {
					const parsed = JSON.parse(stdout) as PythonBundleExtractResult;
					if (!parsed.available) {
						log.warn(parsed.error || 'Python/UnityPy block bundle extraction is unavailable; falling back to raw bundle text scan.');
						resolve(null);
						return;
					}

					const results = new Map<string, ExtractedTextBlock[]>();
					Object.entries(parsed.results || {}).forEach(([sourcePath, blocks]) => {
						results.set(sourcePath, Array.isArray(blocks) ? blocks.filter(isExtractedTextBlock) : []);
					});
					resolve(results);
				} catch (parseError) {
					log.warn('Failed to parse Python/UnityPy block bundle extraction results; falling back to raw bundle text scan.');
					log.warn(parseError);
					resolve(null);
				}
			}
		);
		child.stdin?.end(JSON.stringify(sourcePaths));
	});
}

function parseSteamLibraryFolders(contents: string): string[] {
	return [...contents.matchAll(LIBRARY_PATH_RE)]
		.map((match) => normalizePathValue(match[1]))
		.filter((libraryPath): libraryPath is string => !!libraryPath);
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

export function looksLikeWorkshopRoot(value: string | null | undefined): boolean {
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

	const match = normalized.match(new RegExp(`^(.*?[\\\\/]steamapps[\\\\/]workshop[\\\\/]content[\\\\/]${TERRATECH_STEAM_APP_ID})(?:[\\\\/].*)?$`, 'i'));
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

	return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'TerraTechWin64_Data', 'Managed', 'Assembly-CSharp.dll'))) || null;
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

export function autoDetectBlockLookupWorkshopRoot(request: Pick<BlockLookupBuildRequest, 'gameExec' | 'modSources' | 'workshopRoot'> = {}): string | null {
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

function createSourceRecord(sourcePath: string, sourceKind: BlockLookupSourceKind, workshopId: string, modTitle: string): SourceRecord {
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

function addSourceRecord(sourceMap: Map<string, SourceRecord>, source: SourceRecord) {
	if (!sourceMap.has(source.sourcePath)) {
		sourceMap.set(source.sourcePath, source);
	}
}

function addModDirectorySources(sourceMap: Map<string, SourceRecord>, modDir: string, modSource?: BlockLookupModSource) {
	if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) {
		return;
	}

	const entries = fs.readdirSync(modDir, { withFileTypes: true });
	const bundles = entries.filter((entry) => entry.isFile()).map((entry) => path.join(modDir, entry.name)).filter(isBundleCandidate);
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

function buildVanillaExportMap(assemblyPath: string): Map<string, string> {
	const gameRoot = path.resolve(assemblyPath, '..', '..', '..');
	const exportDir = path.join(gameRoot, '_Export', 'BlockJson');
	const exportMap = new Map<string, string>();
	if (!fs.existsSync(exportDir)) {
		return exportMap;
	}

	for (const entry of fs.readdirSync(exportDir, { withFileTypes: true })) {
		if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
			continue;
		}
		const stem = path.basename(entry.name, '.json').replace(/_prefab$/i, '');
		exportMap.set(normalizedLookupKey(stem), stem);
	}
	return exportMap;
}

function escapePowerShellSingleQuoted(value: string) {
	return value.replace(/'/g, "''");
}

function loadVanillaEnumNames(assemblyPath: string, execFile: typeof childProcess.execFile = childProcess.execFile): Promise<string[]> {
	const command = [
		`$asm = [Reflection.Assembly]::LoadFrom('${escapePowerShellSingleQuoted(assemblyPath)}')`,
		"$t = $asm.GetType('BlockTypes')",
		"if ($null -eq $t) { throw 'BlockTypes enum not found' }",
		'[Enum]::GetNames($t) | ConvertTo-Json -Compress'
	].join('; ');

	return new Promise((resolve, reject) => {
		execFile('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 30000 }, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}

			try {
				const parsed = JSON.parse(stdout.trim());
				resolve(Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]);
			} catch (parseError) {
				reject(parseError);
			}
		});
	});
}

async function extractRecordsFromSource(source: SourceRecord, extractedBundleBlocks?: ExtractedTextBlock[]): Promise<BlockLookupRecord[]> {
	if (source.sourceKind === 'vanilla') {
		try {
			const exportMap = buildVanillaExportMap(source.sourcePath);
			const enumNames = await loadVanillaEnumNames(source.sourcePath);
			return enumNames.map((enumName) => {
				const displaySource = exportMap.get(normalizedLookupKey(enumName)) || enumName;
				const block: ExtractedTextBlock = {
					blockName: humanizeIdentifier(displaySource),
					blockId: '',
					internalName: enumName
				};
				return createBlockLookupRecord(source, block, {
					preferredAlias: enumName,
					fallbackAlias: enumName
				});
			});
		} catch (error) {
			log.warn(`Failed to index vanilla TerraTech blocks from ${source.sourcePath}`);
			log.warn(error);
			return [];
		}
	}

	if (source.sourceKind === 'bundle' && extractedBundleBlocks) {
		return extractedBundleBlocks.map((block) => createBlockLookupRecord(source, block));
	}

	try {
		const text = fs.readFileSync(source.sourcePath).toString('utf8');
		const blocks = extractNuterraBlocksFromText(text, path.basename(source.sourcePath, path.extname(source.sourcePath)));
		return blocks.map((block) => createBlockLookupRecord(source, block));
	} catch (error) {
		log.warn(`Failed to index block source ${source.sourcePath}`);
		log.warn(error);
		return [];
	}
}

function createIndexStats(index: PersistedBlockLookupIndex, scanned = 0, skipped = 0, removed = 0, updatedBlocks = 0): BlockLookupIndexStats {
	return {
		sources: index.sources.length,
		scanned,
		skipped,
		removed,
		blocks: index.records.length,
		updatedBlocks,
		builtAt: index.builtAt || undefined
	};
}

function createSourceIndexRecord(source: SourceRecord): BlockLookupIndexSource {
	return {
		sourcePath: source.sourcePath,
		workshopId: source.workshopId,
		modTitle: source.modTitle,
		sourceKind: source.sourceKind,
		size: source.size,
		mtimeMs: source.mtimeMs
	};
}

function collectSources(request: BlockLookupBuildRequest): { sources: SourceRecord[]; workshopRoot: string } {
	const sourceMap = new Map<string, SourceRecord>();

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
		sourceMap.set(
			path.normalize(vanillaAssemblyPath),
			createSourceRecord(vanillaAssemblyPath, 'vanilla', 'vanilla', 'Vanilla TerraTech')
		);
	}

	return {
		sources: [...sourceMap.values()].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
		workshopRoot
	};
}

function buildSearchBlob(record: BlockLookupRecord) {
	return [
		record.blockName,
		record.internalName,
		record.blockId,
		record.modTitle,
		record.workshopId,
		record.preferredAlias,
		record.fallbackAlias,
		record.spawnCommand
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

export async function buildBlockLookupIndex(userDataPath: string, request: BlockLookupBuildRequest): Promise<{ stats: BlockLookupIndexStats; settings: BlockLookupSettings }> {
	const existingIndex = readBlockLookupIndex(userDataPath);
	const existingSourceMap = new Map(existingIndex.sources.map((source) => [source.sourcePath, source]));
	const existingRecordsBySource = new Map<string, BlockLookupRecord[]>();
	existingIndex.records.forEach((record) => {
		const records = existingRecordsBySource.get(record.sourcePath) || [];
		records.push(record);
		existingRecordsBySource.set(record.sourcePath, records);
	});

	const { sources, workshopRoot } = collectSources(request);
	const nextRecords: BlockLookupRecord[] = [];
	const nextSources: BlockLookupIndexSource[] = [];
	let scanned = 0;
	let skipped = 0;
	let updatedBlocks = 0;
	const isUnchanged = (source: SourceRecord) => {
		const existingSource = existingSourceMap.get(source.sourcePath);
		return !request.forceRebuild && existingSource?.size === source.size && existingSource.mtimeMs === source.mtimeMs;
	};
	const changedBundleSources = sources.filter((source) => source.sourceKind === 'bundle' && !isUnchanged(source));
	const pythonBundleBlocks = await extractBundleBlocksWithPython(changedBundleSources.map((source) => source.sourcePath));

	for (const source of sources) {
		const existingSource = existingSourceMap.get(source.sourcePath);
		if (isUnchanged(source)) {
			skipped += 1;
			nextSources.push(existingSource!);
			nextRecords.push(...(existingRecordsBySource.get(source.sourcePath) || []));
			continue;
		}

		const records = await extractRecordsFromSource(source, pythonBundleBlocks?.get(source.sourcePath));
		scanned += 1;
		updatedBlocks += records.length;
		nextSources.push(createSourceIndexRecord(source));
		nextRecords.push(...records);
	}

	const seenSourcePaths = new Set(sources.map((source) => source.sourcePath));
	const removed = existingIndex.sources.filter((source) => !seenSourcePaths.has(source.sourcePath)).length;
	const builtAt = new Date().toISOString();
	const nextIndex: PersistedBlockLookupIndex = {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt,
		sources: nextSources,
		records: nextRecords
	};

	writeBlockLookupIndex(userDataPath, nextIndex);
	const settings = writeBlockLookupSettings(userDataPath, { workshopRoot });
	return {
		settings,
		stats: createIndexStats(nextIndex, scanned, skipped, removed, updatedBlocks)
	};
}

export function getBlockLookupStats(userDataPath: string): BlockLookupIndexStats | null {
	const index = readBlockLookupIndex(userDataPath);
	if (!index.builtAt) {
		return null;
	}
	return createIndexStats(index);
}

export function searchBlockLookupIndex(userDataPath: string, query: string, limit?: number): BlockLookupSearchResult {
	const index = readBlockLookupIndex(userDataPath);
	if (!index.builtAt) {
		return {
			rows: [],
			stats: null
		};
	}

	const normalizedQuery = query.trim().toLowerCase();
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const rows = index.records
		.filter((record) => {
			if (tokens.length === 0) {
				return true;
			}

			const blob = buildSearchBlob(record);
			return tokens.every((token) => blob.includes(token));
		})
		.sort((left, right) => {
			const leftBlock = left.blockName.toLowerCase();
			const rightBlock = right.blockName.toLowerCase();
			const leftInternal = left.internalName.toLowerCase();
			const rightInternal = right.internalName.toLowerCase();
			const leftId = left.blockId.toLowerCase();
			const rightId = right.blockId.toLowerCase();
			const leftRank = leftBlock === normalizedQuery ? 0 : leftInternal === normalizedQuery ? 1 : leftId === normalizedQuery ? 2 : 3;
			const rightRank = rightBlock === normalizedQuery ? 0 : rightInternal === normalizedQuery ? 1 : rightId === normalizedQuery ? 2 : 3;
			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}

			const leftDeprecated = leftInternal.startsWith('_deprecated_') || leftBlock.startsWith('deprecated ');
			const rightDeprecated = rightInternal.startsWith('_deprecated_') || rightBlock.startsWith('deprecated ');
			if (leftDeprecated !== rightDeprecated) {
				return leftDeprecated ? 1 : -1;
			}

			return `${left.modTitle}\0${left.blockName}`.localeCompare(`${right.modTitle}\0${right.blockName}`);
		});

	return {
		rows: limit && limit > 0 ? rows.slice(0, limit) : rows,
		stats: createIndexStats(index)
	};
}
