import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import {
	BLOCK_LOOKUP_INDEX_VERSION,
	BlockLookupBuildRequest,
	BlockLookupIndexSource,
	BlockLookupIndexStats,
	BlockLookupRecord,
	BlockLookupSearchResult,
	BlockLookupSettings,
	PersistedBlockLookupIndex
} from 'shared/block-lookup';
import { writeUtf8FileAtomic } from './storage';
import { extractBundleBlocksWithPython, extractRecordsFromSource } from './block-lookup-extraction';
import { createBlockLookupIndexPlan, createBlockLookupIndexStats, createBlockLookupSourceIndexRecord } from './block-lookup-index-planner';
import { collectBlockLookupSources, normalizeWorkshopRoot } from './block-lookup-source-discovery';

export { buildBlockLookupAliases, extractNuterraBlocksFromText } from './block-lookup-extraction';

const BLOCK_LOOKUP_INDEX_FILENAME = 'block-lookup-index.json';
const BLOCK_LOOKUP_SETTINGS_FILENAME = 'block-lookup-settings.json';

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

function readBlockLookupIndex(userDataPath: string): PersistedBlockLookupIndex {
	const index = readJsonFile<PersistedBlockLookupIndex>(getBlockLookupIndexPath(userDataPath));
	if (!index || index.version !== BLOCK_LOOKUP_INDEX_VERSION || !Array.isArray(index.sources) || !Array.isArray(index.records)) {
		return createEmptyIndex();
	}

	return index;
}

function writeBlockLookupIndex(userDataPath: string, index: PersistedBlockLookupIndex) {
	writeJsonFile(getBlockLookupIndexPath(userDataPath), index);
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

export async function buildBlockLookupIndex(
	userDataPath: string,
	request: BlockLookupBuildRequest
): Promise<{ stats: BlockLookupIndexStats; settings: BlockLookupSettings }> {
	const existingIndex = readBlockLookupIndex(userDataPath);
	const { sources, workshopRoot } = collectBlockLookupSources(request);
	const indexPlan = createBlockLookupIndexPlan(existingIndex, sources, request.forceRebuild);
	const nextRecords: BlockLookupRecord[] = [];
	const nextSources: BlockLookupIndexSource[] = [];
	let scanned = 0;
	let skipped = 0;
	let updatedBlocks = 0;
	const changedBundleSources = indexPlan.tasks
		.filter((task) => task.source.sourceKind === 'bundle' && !task.reusedRecords)
		.map((task) => task.source);
	const pythonBundleBlocks = await extractBundleBlocksWithPython(changedBundleSources.map((source) => source.sourcePath));

	for (const task of indexPlan.tasks) {
		if (task.reusedRecords) {
			skipped += 1;
			nextSources.push(task.existingSource!);
			nextRecords.push(...task.reusedRecords);
			continue;
		}

		const source = task.source;
		const records = await extractRecordsFromSource(source, pythonBundleBlocks?.get(source.sourcePath));
		scanned += 1;
		updatedBlocks += records.length;
		nextSources.push(createBlockLookupSourceIndexRecord(source));
		nextRecords.push(...records);
	}

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
		stats: createBlockLookupIndexStats(nextIndex, scanned, skipped, indexPlan.removed, updatedBlocks)
	};
}

export function getBlockLookupStats(userDataPath: string): BlockLookupIndexStats | null {
	const index = readBlockLookupIndex(userDataPath);
	if (!index.builtAt) {
		return null;
	}
	return createBlockLookupIndexStats(index);
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
		stats: createBlockLookupIndexStats(index)
	};
}
