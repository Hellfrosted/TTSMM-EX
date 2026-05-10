import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import {
	extractBundleTextAssetOutcomes,
	extractBundleTextAssets,
	type BlockLookupBundlePreviewAsset,
	type BlockLookupBundleTextAssetExtractionOutcome
} from './block-lookup-bundle-text-assets';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';
import { createBlockLookupPreviewImageUrl } from './preview-protocol';
import {
	createBlockLookupRecord,
	createBlockLookupRecordsFromTextAssets,
	humanizeBlockLookupIdentifier,
	normalizedBlockLookupKey,
	readBlockLookupSourceTextAsset,
	type ExtractedTextBlock
} from './block-lookup-nuterra-text';

interface BlockLookupSourceExtractionAdapter {
	extractRecords(
		sources: readonly BlockLookupSourceRecord[],
		options?: BlockLookupSourceExtractionOptions
	): Promise<Map<string, BlockLookupRecord[]>>;
}

export type BlockLookupSourceExtractionAdapters = Partial<
	Record<BlockLookupSourceRecord['sourceKind'], BlockLookupSourceExtractionAdapter>
>;

interface BlockLookupBundleSourceExtractionAdapterDependencies {
	extractBundleTextAssetOutcomes?: typeof extractBundleTextAssetOutcomes;
	extractBundleTextAssets?: typeof extractBundleTextAssets;
}

export interface BlockLookupSourceExtractionOptions {
	previewCacheDir?: string;
	renderedPreviewsEnabled?: boolean;
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
		exportMap.set(normalizedBlockLookupKey(stem), stem);
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

function createSingleSourceExtractionAdapter(
	extractSourceRecords: (source: BlockLookupSourceRecord) => Promise<BlockLookupRecord[]> | BlockLookupRecord[]
): BlockLookupSourceExtractionAdapter {
	return {
		async extractRecords(sources) {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				recordsBySourcePath.set(source.sourcePath, await extractSourceRecords(source));
			}
			return recordsBySourcePath;
		}
	};
}

function normalizePreviewAssetMatchKey(value: string): string {
	return normalizedBlockLookupKey(value).replace(/(renderedpreview|thumbnail|preview|thumb|icon|texture|sprite)$/g, '');
}

function getRecordPreviewMatchKeys(record: BlockLookupRecord): string[] {
	return [record.internalName, record.blockName, record.preferredAlias.replace(/\(.*$/, '')]
		.map(normalizePreviewAssetMatchKey)
		.filter((key) => key.length > 0);
}

function findPreviewAssetForRecord(
	record: BlockLookupRecord,
	previewAssets: readonly BlockLookupBundlePreviewAsset[]
): BlockLookupBundlePreviewAsset | undefined {
	if (previewAssets.length === 1) {
		return previewAssets[0];
	}

	const recordKeys = getRecordPreviewMatchKeys(record);
	return previewAssets.find((asset) => {
		const assetKey = normalizePreviewAssetMatchKey(asset.assetName);
		return recordKeys.some((recordKey) => assetKey.includes(recordKey) || recordKey.includes(assetKey));
	});
}

function createRenderedPreviewFromAsset(previewAsset: BlockLookupBundlePreviewAsset): BlockLookupRecord['renderedPreview'] {
	const imageUrl = createBlockLookupPreviewImageUrl(previewAsset.cacheRelativePath);
	if (!imageUrl) {
		return undefined;
	}

	return {
		imageUrl,
		...(previewAsset.width ? { width: Math.round(previewAsset.width) } : {}),
		...(previewAsset.height ? { height: Math.round(previewAsset.height) } : {})
	};
}

function attachRenderedPreviewsToRecords(
	records: readonly BlockLookupRecord[],
	previewAssets: readonly BlockLookupBundlePreviewAsset[],
	options: BlockLookupSourceExtractionOptions | undefined
): BlockLookupRecord[] {
	if (!options?.renderedPreviewsEnabled || previewAssets.length === 0 || records.length === 0) {
		return [...records];
	}

	return records.map((record) => {
		const previewAsset = findPreviewAssetForRecord(record, previewAssets);
		const renderedPreview = previewAsset ? createRenderedPreviewFromAsset(previewAsset) : undefined;
		return renderedPreview ? { ...record, renderedPreview } : record;
	});
}

async function extractVanillaSourceRecords(source: BlockLookupSourceRecord): Promise<BlockLookupRecord[]> {
	try {
		const exportMap = buildVanillaExportMap(source.sourcePath);
		const enumNames = await loadVanillaEnumNames(source.sourcePath);
		return enumNames.map((enumName) => {
			const displaySource = exportMap.get(normalizedBlockLookupKey(enumName)) || enumName;
			const block: ExtractedTextBlock = {
				blockName: humanizeBlockLookupIdentifier(displaySource),
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

function extractJsonSourceRecords(source: BlockLookupSourceRecord): BlockLookupRecord[] {
	try {
		return createBlockLookupRecordsFromTextAssets(source, [readBlockLookupSourceTextAsset(source.sourcePath)]);
	} catch (error) {
		log.warn(`Failed to index block source ${source.sourcePath}`);
		log.warn(error);
		return [];
	}
}

export function createBlockLookupBundleSourceExtractionAdapter(
	dependencies: BlockLookupBundleSourceExtractionAdapterDependencies = {}
): BlockLookupSourceExtractionAdapter {
	const createTextAssetOnlyOutcomes = async (
		sourcePaths: readonly string[]
	): Promise<Map<string, BlockLookupBundleTextAssetExtractionOutcome>> => {
		const textAssetsBySourcePath = await dependencies.extractBundleTextAssets!(sourcePaths);
		return new Map(
			[...textAssetsBySourcePath].map(([sourcePath, textAssets]) => [
				sourcePath,
				{
					issues: [],
					previewAssets: [],
					sourcePath,
					status: 'success',
					textAssets
				}
			])
		);
	};
	return {
		async extractRecords(sources, options) {
			const sourcePaths = sources.map((source) => source.sourcePath);
			const textAssetOutcomesBySourcePath = dependencies.extractBundleTextAssetOutcomes
				? await dependencies.extractBundleTextAssetOutcomes(sourcePaths)
				: dependencies.extractBundleTextAssets
					? await createTextAssetOnlyOutcomes(sourcePaths)
					: await extractBundleTextAssetOutcomes(sourcePaths, { previewCacheDir: options?.previewCacheDir });
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				const outcome = textAssetOutcomesBySourcePath.get(source.sourcePath);
				const records = createBlockLookupRecordsFromTextAssets(source, outcome?.textAssets ?? []);
				recordsBySourcePath.set(source.sourcePath, attachRenderedPreviewsToRecords(records, outcome?.previewAssets ?? [], options));
			}
			return recordsBySourcePath;
		}
	};
}

function createDefaultSourceExtractionAdapters(): Required<BlockLookupSourceExtractionAdapters> {
	return {
		bundle: createBlockLookupBundleSourceExtractionAdapter(),
		json: createSingleSourceExtractionAdapter(extractJsonSourceRecords),
		vanilla: createSingleSourceExtractionAdapter(extractVanillaSourceRecords)
	};
}

function createBlockLookupSourceExtractionRouter(adapters: BlockLookupSourceExtractionAdapters = {}) {
	const sourceAdapters = {
		...createDefaultSourceExtractionAdapters(),
		...adapters
	};

	return {
		async extractRecords(
			sources: readonly BlockLookupSourceRecord[],
			options?: BlockLookupSourceExtractionOptions
		): Promise<Map<string, BlockLookupRecord[]>> {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			const sourcesByKind = new Map<BlockLookupSourceRecord['sourceKind'], BlockLookupSourceRecord[]>();
			for (const source of sources) {
				const kindSources = sourcesByKind.get(source.sourceKind) ?? [];
				kindSources.push(source);
				sourcesByKind.set(source.sourceKind, kindSources);
			}

			for (const [sourceKind, kindSources] of sourcesByKind) {
				const adapter = sourceAdapters[sourceKind];
				const extractedRecords = options ? await adapter.extractRecords(kindSources, options) : await adapter.extractRecords(kindSources);
				for (const source of kindSources) {
					recordsBySourcePath.set(source.sourcePath, extractedRecords.get(source.sourcePath) ?? []);
				}
			}

			return recordsBySourcePath;
		}
	};
}

export async function extractRecordsFromSources(
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceExtractionAdapters = {},
	options?: BlockLookupSourceExtractionOptions
): Promise<Map<string, BlockLookupRecord[]>> {
	return createBlockLookupSourceExtractionRouter(adapters).extractRecords(sources, options);
}
