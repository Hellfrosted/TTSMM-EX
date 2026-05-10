import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import log from 'electron-log';
import type { BlockLookupRecord } from 'shared/block-lookup';
import {
	extractBlockLookupBundleOutcomes,
	extractBundleTextAssets,
	type BlockLookupBundlePreviewAsset,
	type BlockLookupBundleExtractionOutcome
} from './block-lookup-bundle-text-assets';
import { loadBlockpediaVanillaPreviewAssets } from './block-lookup-blockpedia-previews';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';
import { assignRenderedBlockPreviewsToRecords } from './block-lookup-rendered-preview-assignment';
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
	extractBlockLookupBundleOutcomes?: typeof extractBlockLookupBundleOutcomes;
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
		'$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::Static',
		'$names = @($t.GetFields($flags) | Where-Object { -not [Attribute]::IsDefined($_, [ObsoleteAttribute]) } | ForEach-Object { $_.Name })',
		'ConvertTo-Json -InputObject $names -Compress'
	].join('; ');

	return new Promise((resolve, reject) => {
		execFile('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 30000 }, (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}

			try {
				const trimmedOutput = stdout.trim();
				if (!trimmedOutput) {
					resolve([]);
					return;
				}
				const parsed = JSON.parse(trimmedOutput);
				resolve(Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]);
			} catch (parseError) {
				reject(parseError);
			}
		});
	});
}

function isDeprecatedVanillaBlockIdentifier(value: string): boolean {
	const identifier = value.trim().replace(/^_/, '');
	return /^deprecated(?:$|[_\s-])/i.test(identifier) || /^Deprecated[A-Z]/.test(identifier) || /^deprecated[A-Z]/.test(identifier);
}

function createSingleSourceExtractionAdapter(
	extractSourceRecords: (
		source: BlockLookupSourceRecord,
		options?: BlockLookupSourceExtractionOptions
	) => Promise<BlockLookupRecord[]> | BlockLookupRecord[]
): BlockLookupSourceExtractionAdapter {
	return {
		async extractRecords(sources, options) {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				recordsBySourcePath.set(source.sourcePath, await extractSourceRecords(source, options));
			}
			return recordsBySourcePath;
		}
	};
}

function getRecordPreviewMatchNameCandidates(records: readonly BlockLookupRecord[]): string[] {
	return [
		...new Set(
			records
				.flatMap((record) => [
					record.internalName,
					record.blockName,
					record.preferredAlias.replace(/\(.*$/, ''),
					...(record.previewAssetNames ?? [])
				])
				.map((value) => value.trim())
				.filter(Boolean)
		)
	];
}

async function extractLocalVanillaPreviewAssets(
	assemblyPath: string,
	records: readonly BlockLookupRecord[],
	options: BlockLookupSourceExtractionOptions | undefined
): Promise<BlockLookupBundlePreviewAsset[]> {
	if (!options?.renderedPreviewsEnabled || !options.previewCacheDir) {
		return [];
	}
	const dataRoot = path.resolve(assemblyPath, '..', '..');
	if (!fs.existsSync(dataRoot)) {
		return [];
	}
	const sourcePaths = [
		path.join(dataRoot, 'StreamingAssets', 'blocks_shared'),
		path.join(dataRoot, 'resources.assets'),
		...fs
			.readdirSync(dataRoot, { withFileTypes: true })
			.filter((entry) => entry.isFile() && /^sharedassets\d+\.assets$/i.test(entry.name))
			.map((entry) => path.join(dataRoot, entry.name))
	].filter((sourcePath, index, allSourcePaths) => fs.existsSync(sourcePath) && allSourcePaths.indexOf(sourcePath) === index);
	if (!sourcePaths.length) {
		return [];
	}
	const previewMatchNames = getRecordPreviewMatchNameCandidates(records);
	try {
		const outcomes = await extractBlockLookupBundleOutcomes(sourcePaths, {
			previewCacheDir: options.previewCacheDir,
			previewMatchNames
		});
		return [...outcomes.values()].flatMap((outcome) => outcome.previewAssets);
	} catch (error) {
		log.warn(`Failed to extract vanilla block previews from ${dataRoot}`);
		log.warn(error);
		return [];
	}
}

async function extractVanillaPreviewAssets(
	assemblyPath: string,
	records: readonly BlockLookupRecord[],
	options: BlockLookupSourceExtractionOptions | undefined
): Promise<BlockLookupBundlePreviewAsset[]> {
	if (!options?.renderedPreviewsEnabled || !options.previewCacheDir) {
		return [];
	}
	const blockpediaPreviewAssets = await loadBlockpediaVanillaPreviewAssets(options.previewCacheDir);
	const localPreviewAssets = await extractLocalVanillaPreviewAssets(assemblyPath, records, options);
	return [...blockpediaPreviewAssets, ...localPreviewAssets];
}

async function extractVanillaSourceRecords(
	source: BlockLookupSourceRecord,
	options?: BlockLookupSourceExtractionOptions
): Promise<BlockLookupRecord[]> {
	try {
		const exportMap = buildVanillaExportMap(source.sourcePath);
		const enumNames = await loadVanillaEnumNames(source.sourcePath);
		const records = enumNames.flatMap((enumName) => {
			const displaySource = exportMap.get(normalizedBlockLookupKey(enumName)) || enumName;
			if (isDeprecatedVanillaBlockIdentifier(enumName) || isDeprecatedVanillaBlockIdentifier(displaySource)) {
				return [];
			}
			const block: ExtractedTextBlock = {
				blockName: humanizeBlockLookupIdentifier(displaySource),
				blockId: '',
				internalName: enumName
			};
			return [
				createBlockLookupRecord(source, block, {
					preferredAlias: enumName,
					fallbackAlias: enumName
				})
			];
		});
		if (records.length === 0) {
			return records;
		}
		const previewAssets = await extractVanillaPreviewAssets(source.sourcePath, records, options);
		return assignRenderedBlockPreviewsToRecords(records, previewAssets, options);
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
	const createTextAssetOnlyOutcomes = async (sourcePaths: readonly string[]): Promise<Map<string, BlockLookupBundleExtractionOutcome>> => {
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
			const blockLookupOutcomesBySourcePath = dependencies.extractBlockLookupBundleOutcomes
				? await dependencies.extractBlockLookupBundleOutcomes(sourcePaths)
				: dependencies.extractBundleTextAssets
					? await createTextAssetOnlyOutcomes(sourcePaths)
					: await extractBlockLookupBundleOutcomes(sourcePaths, { previewCacheDir: options?.previewCacheDir });
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				const outcome = blockLookupOutcomesBySourcePath.get(source.sourcePath);
				const records = createBlockLookupRecordsFromTextAssets(source, outcome?.textAssets ?? []);
				recordsBySourcePath.set(source.sourcePath, assignRenderedBlockPreviewsToRecords(records, outcome?.previewAssets ?? [], options));
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
