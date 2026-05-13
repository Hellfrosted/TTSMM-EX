import { Effect } from 'effect';
import log from 'electron-log';
import path from 'path';
import {
	BLOCK_LOOKUP_INDEX_VERSION,
	BlockLookupBuildRequest,
	BlockLookupIndexProgressCallback,
	BlockLookupIndexStats,
	BlockLookupPreviewBounds,
	BlockLookupRecord,
	BlockLookupSearchResult,
	BlockLookupSettings,
	PersistedBlockLookupIndex
} from 'shared/block-lookup';
import { createBlockLookupIndexBuild, createBlockLookupIndexProgress } from './block-lookup-index-build';
import { createBlockLookupIndexStats } from './block-lookup-index-planner';
import { searchBlockLookupRecords } from './block-lookup-search';
import { normalizeWorkshopRoot } from './block-lookup-source-discovery';
import { getBlockLookupPreviewCachePath } from './preview-protocol';
import { fileExistsEffect, readJsonFileEffect, writeUtf8FileAtomicEffect } from './storage';

export { buildBlockLookupAliases, extractNuterraBlocksFromText } from './block-lookup-nuterra-text';

const BLOCK_LOOKUP_INDEX_FILENAME = 'block-lookup-index.json';
const BLOCK_LOOKUP_SETTINGS_FILENAME = 'block-lookup-settings.json';

function getBlockLookupIndexPath(userDataPath: string) {
	return path.join(userDataPath, BLOCK_LOOKUP_INDEX_FILENAME);
}

function getBlockLookupSettingsPath(userDataPath: string) {
	return path.join(userDataPath, BLOCK_LOOKUP_SETTINGS_FILENAME);
}

const readBlockLookupJsonFileEffect = Effect.fnUntraced(function* <T>(filepath: string): Effect.fn.Return<T | null> {
	const exists = yield* fileExistsEffect(filepath).pipe(Effect.catch(() => Effect.succeed(false)));
	if (!exists) {
		return null;
	}

	return yield* readJsonFileEffect<T>(filepath).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to read JSON file ${filepath}`);
			log.warn(error.cause);
			return Effect.succeed(null);
		})
	);
});

function writeJsonFileEffect(filepath: string, value: unknown) {
	return writeUtf8FileAtomicEffect(filepath, JSON.stringify(value, null, 2));
}

function runBlockLookupStorage<A>(effect: Effect.Effect<A, unknown>) {
	return Effect.runSync(effect);
}

export function readBlockLookupSettings(userDataPath: string): BlockLookupSettings {
	return runBlockLookupStorage(readBlockLookupSettingsEffect(userDataPath));
}

export const readBlockLookupSettingsEffect = Effect.fnUntraced(function* (userDataPath: string): Effect.fn.Return<BlockLookupSettings> {
	const settings = yield* readBlockLookupJsonFileEffect<Partial<BlockLookupSettings>>(getBlockLookupSettingsPath(userDataPath));
	return {
		workshopRoot: typeof settings?.workshopRoot === 'string' ? settings.workshopRoot : '',
		renderedPreviewsEnabled: settings?.renderedPreviewsEnabled === true
	};
});

export function writeBlockLookupSettings(userDataPath: string, settings: BlockLookupSettings): BlockLookupSettings {
	return runBlockLookupStorage(writeBlockLookupSettingsEffect(userDataPath, settings));
}

export const writeBlockLookupSettingsEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	settings: BlockLookupSettings
): Effect.fn.Return<BlockLookupSettings, unknown> {
	const normalizedSettings: BlockLookupSettings = {
		workshopRoot: normalizeWorkshopRoot(settings.workshopRoot) || settings.workshopRoot.trim(),
		renderedPreviewsEnabled: settings.renderedPreviewsEnabled === true
	};
	yield* writeJsonFileEffect(getBlockLookupSettingsPath(userDataPath), normalizedSettings);
	return normalizedSettings;
});

function createEmptyIndex(): PersistedBlockLookupIndex {
	return {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: '',
		renderedPreviewsEnabled: false,
		sources: [],
		records: []
	};
}

function isBlockLookupSourceKind(value: unknown): value is PersistedBlockLookupIndex['records'][number]['sourceKind'] {
	return value === 'vanilla' || value === 'json' || value === 'bundle';
}

function readString(value: unknown) {
	return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const strings = [
		...new Set(
			value.flatMap((entry) => {
				const text = readString(entry)?.trim();
				return text ? [text] : [];
			})
		)
	];
	return strings.length ? strings : undefined;
}

function readPositiveNumber(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeBlockLookupPreviewBounds(value: unknown): BlockLookupPreviewBounds | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const bounds = value as Record<string, unknown>;
	const x = readPositiveNumber(bounds.x);
	const y = readPositiveNumber(bounds.y);
	const z = readPositiveNumber(bounds.z);
	return x && y && z ? { x, y, z } : undefined;
}

function normalizeBlockLookupSource(source: unknown): PersistedBlockLookupIndex['sources'][number] | undefined {
	if (!source || typeof source !== 'object') {
		return undefined;
	}
	const sourceRecord = source as Record<string, unknown>;
	const sourcePath = readString(sourceRecord.sourcePath);
	const workshopId = readString(sourceRecord.workshopId);
	const modTitle = readString(sourceRecord.modTitle);
	const sourceKind = sourceRecord.sourceKind;
	const size = sourceRecord.size;
	const mtimeMs = sourceRecord.mtimeMs;

	if (
		!sourcePath ||
		workshopId === undefined ||
		modTitle === undefined ||
		!isBlockLookupSourceKind(sourceKind) ||
		typeof size !== 'number' ||
		typeof mtimeMs !== 'number'
	) {
		return undefined;
	}

	return {
		sourcePath,
		workshopId,
		modTitle,
		sourceKind,
		size,
		mtimeMs
	};
}

function normalizeBlockLookupRenderedPreview(value: unknown): BlockLookupRecord['renderedPreview'] {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const previewRecord = value as Record<string, unknown>;
	const cacheRelativePath = readString(previewRecord.cacheRelativePath);
	if (!cacheRelativePath) {
		return undefined;
	}

	const width =
		typeof previewRecord.width === 'number' && Number.isFinite(previewRecord.width) ? Math.round(previewRecord.width) : undefined;
	const height =
		typeof previewRecord.height === 'number' && Number.isFinite(previewRecord.height) ? Math.round(previewRecord.height) : undefined;
	return {
		cacheRelativePath,
		...(width !== undefined ? { width } : {}),
		...(height !== undefined ? { height } : {})
	};
}

function normalizeBlockLookupRecord(record: unknown): PersistedBlockLookupIndex['records'][number] | undefined {
	if (!record || typeof record !== 'object') {
		return undefined;
	}
	const indexRecord = record as Record<string, unknown>;
	const blockName = readString(indexRecord.blockName);
	const internalName = readString(indexRecord.internalName);
	const blockId = readString(indexRecord.blockId);
	const modTitle = readString(indexRecord.modTitle);
	const workshopId = readString(indexRecord.workshopId);
	const sourceKind = indexRecord.sourceKind;
	const sourcePath = readString(indexRecord.sourcePath);
	const preferredAlias = readString(indexRecord.preferredAlias);
	const fallbackAlias = readString(indexRecord.fallbackAlias);
	const spawnCommand = readString(indexRecord.spawnCommand);
	const fallbackSpawnCommand = readString(indexRecord.fallbackSpawnCommand);
	const previewBounds = normalizeBlockLookupPreviewBounds(indexRecord.previewBounds);
	const previewAssetNames = readStringArray(indexRecord.previewAssetNames);
	const renderedPreview = normalizeBlockLookupRenderedPreview(indexRecord.renderedPreview);

	if (
		blockName === undefined ||
		internalName === undefined ||
		blockId === undefined ||
		modTitle === undefined ||
		workshopId === undefined ||
		!isBlockLookupSourceKind(sourceKind) ||
		sourcePath === undefined ||
		preferredAlias === undefined ||
		fallbackAlias === undefined ||
		spawnCommand === undefined ||
		fallbackSpawnCommand === undefined
	) {
		return undefined;
	}

	return {
		blockName,
		internalName,
		blockId,
		modTitle,
		workshopId,
		sourceKind,
		sourcePath,
		previewBounds,
		...(previewAssetNames ? { previewAssetNames } : {}),
		...(renderedPreview ? { renderedPreview } : {}),
		preferredAlias,
		fallbackAlias,
		spawnCommand,
		fallbackSpawnCommand
	};
}

function normalizeBlockLookupIndex(index: unknown): PersistedBlockLookupIndex {
	if (!index || typeof index !== 'object') {
		return createEmptyIndex();
	}

	const indexRecord = index as Record<string, unknown>;
	if (indexRecord.version !== BLOCK_LOOKUP_INDEX_VERSION || !Array.isArray(indexRecord.sources) || !Array.isArray(indexRecord.records)) {
		return createEmptyIndex();
	}

	const records = indexRecord.records.flatMap((record) => {
		const normalizedRecord = normalizeBlockLookupRecord(record);
		return normalizedRecord ? [normalizedRecord] : [];
	});
	const sourceRecords = Array.isArray(indexRecord.sourceRecords)
		? indexRecord.sourceRecords.flatMap((record) => {
				const normalizedRecord = normalizeBlockLookupRecord(record);
				return normalizedRecord ? [normalizedRecord] : [];
			})
		: undefined;

	return {
		version: BLOCK_LOOKUP_INDEX_VERSION,
		builtAt: typeof indexRecord.builtAt === 'string' ? indexRecord.builtAt : '',
		renderedPreviewsEnabled: indexRecord.renderedPreviewsEnabled === true,
		sources: indexRecord.sources.flatMap((source) => {
			const normalizedSource = normalizeBlockLookupSource(source);
			return normalizedSource ? [normalizedSource] : [];
		}),
		records,
		sourceRecords
	};
}

export function readBlockLookupIndex(userDataPath: string): PersistedBlockLookupIndex {
	return runBlockLookupStorage(readBlockLookupIndexEffect(userDataPath));
}

export const readBlockLookupIndexEffect = Effect.fnUntraced(function* (userDataPath: string): Effect.fn.Return<PersistedBlockLookupIndex> {
	return normalizeBlockLookupIndex(yield* readBlockLookupJsonFileEffect<unknown>(getBlockLookupIndexPath(userDataPath)));
});

const writeBlockLookupIndexEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	index: PersistedBlockLookupIndex
): Effect.fn.Return<void, unknown> {
	yield* writeJsonFileEffect(getBlockLookupIndexPath(userDataPath), index);
});

export const buildBlockLookupIndex = Effect.fnUntraced(function* (
	userDataPath: string,
	request: BlockLookupBuildRequest,
	onProgress?: BlockLookupIndexProgressCallback
): Effect.fn.Return<{ stats: BlockLookupIndexStats }, unknown> {
	const existingIndex = yield* readBlockLookupIndexEffect(userDataPath);
	const settings = yield* readBlockLookupSettingsEffect(userDataPath);
	const build = yield* createBlockLookupIndexBuild(
		existingIndex,
		{
			...request,
			renderedPreviewsEnabled: request.renderedPreviewsEnabled ?? settings.renderedPreviewsEnabled
		},
		undefined,
		onProgress,
		{
			previewCacheDir: getBlockLookupPreviewCachePath(userDataPath)
		}
	);
	onProgress?.(createBlockLookupIndexProgress('writing-index', 0, 1, 98));
	yield* writeBlockLookupIndexEffect(userDataPath, build.index);
	onProgress?.(createBlockLookupIndexProgress('complete', 1, 1, 100));
	return {
		stats: build.stats
	};
});

export function getBlockLookupStats(userDataPath: string): BlockLookupIndexStats | null {
	return runBlockLookupStorage(getBlockLookupStatsEffect(userDataPath));
}

export function searchBlockLookupIndex(userDataPath: string, query: string, limit?: number): BlockLookupSearchResult {
	return runBlockLookupStorage(searchBlockLookupIndexEffect(userDataPath, query, limit));
}

export const getBlockLookupStatsEffect = Effect.fnUntraced(function* (
	userDataPath: string
): Effect.fn.Return<BlockLookupIndexStats | null> {
	const index = yield* readBlockLookupIndexEffect(userDataPath);
	if (!index.builtAt) {
		return null;
	}
	return createBlockLookupIndexStats(index);
});

export const searchBlockLookupIndexEffect = Effect.fnUntraced(function* (
	userDataPath: string,
	query: string,
	limit?: number
): Effect.fn.Return<BlockLookupSearchResult> {
	const index = yield* readBlockLookupIndexEffect(userDataPath);
	return searchBlockLookupRecords(index, query, limit);
});
