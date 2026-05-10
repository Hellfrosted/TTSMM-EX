import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import log from 'electron-log';
import { Effect } from 'effect';
import type { BlockLookupRecord } from 'shared/block-lookup';
import {
	extractBlockLookupBundleOutcomes,
	extractBundleTextAssets,
	type BlockLookupBundlePreviewAsset,
	type BlockLookupBundleExtractionOutcome
} from './block-lookup-bundle-text-assets';
import { loadBlockpediaVanillaPreviewAssets } from './block-lookup-blockpedia-previews';
import type { BlockLookupSourceRecord } from './block-lookup-source-discovery';
import {
	assignRenderedBlockPreviewsToRecords,
	getBlockLookupRecordPreviewMatchNameCandidates
} from './block-lookup-rendered-preview-assignment';
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
	): Effect.Effect<Map<string, BlockLookupRecord[]>, unknown>;
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

const loadVanillaEnumNames = Effect.fnUntraced(function* (
	assemblyPath: string,
	execFile: typeof childProcess.execFile = childProcess.execFile
): Effect.fn.Return<string[], unknown> {
	const command = [
		`$asm = [Reflection.Assembly]::LoadFrom('${escapePowerShellSingleQuoted(assemblyPath)}')`,
		"$t = $asm.GetType('BlockTypes')",
		"if ($null -eq $t) { throw 'BlockTypes enum not found' }",
		'$flags = [Reflection.BindingFlags]::Public -bor [Reflection.BindingFlags]::Static',
		'$names = @($t.GetFields($flags) | Where-Object { -not [Attribute]::IsDefined($_, [ObsoleteAttribute]) } | ForEach-Object { $_.Name })',
		'ConvertTo-Json -InputObject $names -Compress'
	].join('; ');

	return yield* Effect.tryPromise({
		try: () =>
			new Promise<string[]>((resolve, reject) => {
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
			}),
		catch: (error) => error
	});
});

function isDeprecatedVanillaBlockIdentifier(value: string): boolean {
	const identifier = value.trim().replace(/^_/, '');
	return /^deprecated(?:$|[_\s-])/i.test(identifier) || /^Deprecated[A-Z]/.test(identifier) || /^deprecated[A-Z]/.test(identifier);
}

function isReservedVanillaBlockIdentifier(value: string): boolean {
	const identifier = value.trim();
	return /^SPE_Reserved_/i.test(identifier) || /^GSO_ArmourNew3_(?:Left|Right)_226$/i.test(identifier);
}

function shouldSkipVanillaBlockIdentifier(value: string): boolean {
	return isDeprecatedVanillaBlockIdentifier(value) || isReservedVanillaBlockIdentifier(value);
}

function createSingleSourceExtractionAdapter(
	extractSourceRecords: (
		source: BlockLookupSourceRecord,
		options?: BlockLookupSourceExtractionOptions
	) => Effect.Effect<BlockLookupRecord[], unknown> | BlockLookupRecord[]
): BlockLookupSourceExtractionAdapter {
	return {
		extractRecords: Effect.fnUntraced(function* (sources, options): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				const records = extractSourceRecords(source, options);
				recordsBySourcePath.set(source.sourcePath, Array.isArray(records) ? records : yield* records);
			}
			return recordsBySourcePath;
		})
	};
}

const extractLocalVanillaPreviewAssets = Effect.fnUntraced(function* (
	assemblyPath: string,
	records: readonly BlockLookupRecord[],
	options: BlockLookupSourceExtractionOptions | undefined
): Effect.fn.Return<BlockLookupBundlePreviewAsset[]> {
	if (!options?.renderedPreviewsEnabled || !options.previewCacheDir) {
		return [];
	}
	const dataRoot = path.resolve(assemblyPath, '..', '..');
	if (!fs.existsSync(dataRoot)) {
		return [];
	}
	const sourcePaths = [
		path.join(dataRoot, 'StreamingAssets', 'blocks_shared'),
		path.join(dataRoot, 'StreamingAssets', 'gamescene'),
		path.join(dataRoot, 'resources.assets'),
		...fs
			.readdirSync(dataRoot, { withFileTypes: true })
			.flatMap((entry) => (entry.isFile() && /^sharedassets\d+\.assets$/i.test(entry.name) ? [path.join(dataRoot, entry.name)] : []))
	].filter((sourcePath, index, allSourcePaths) => fs.existsSync(sourcePath) && allSourcePaths.indexOf(sourcePath) === index);
	if (!sourcePaths.length) {
		return [];
	}
	const previewMatchNames = getBlockLookupRecordPreviewMatchNameCandidates(records);
	const outcomes = yield* extractBlockLookupBundleOutcomes(sourcePaths, {
		previewCacheDir: options.previewCacheDir,
		previewMatchNames
	}).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to extract vanilla block previews from ${dataRoot}`);
			log.warn(error);
			return Effect.succeed(null);
		})
	);
	return outcomes ? [...outcomes.values()].flatMap((outcome) => outcome.previewAssets) : [];
});

const extractVanillaPreviewAssets = Effect.fnUntraced(function* (
	assemblyPath: string,
	records: readonly BlockLookupRecord[],
	options: BlockLookupSourceExtractionOptions | undefined
): Effect.fn.Return<BlockLookupBundlePreviewAsset[]> {
	if (!options?.renderedPreviewsEnabled || !options.previewCacheDir) {
		return [];
	}
	const blockpediaPreviewAssets = yield* loadBlockpediaVanillaPreviewAssets(options.previewCacheDir);
	const localPreviewAssets = yield* extractLocalVanillaPreviewAssets(assemblyPath, records, options);
	return [...blockpediaPreviewAssets, ...localPreviewAssets];
});

const extractVanillaSourceRecords = Effect.fnUntraced(function* (
	source: BlockLookupSourceRecord,
	options?: BlockLookupSourceExtractionOptions
): Effect.fn.Return<BlockLookupRecord[]> {
	const enumNames = yield* loadVanillaEnumNames(source.sourcePath).pipe(
		Effect.catch((error) => {
			log.warn(`Failed to index vanilla TerraTech blocks from ${source.sourcePath}`);
			log.warn(error);
			return Effect.succeed(null);
		})
	);
	if (!enumNames) {
		return [];
	}
	try {
		const exportMap = buildVanillaExportMap(source.sourcePath);
		const records = enumNames.flatMap((enumName) => {
			const displaySource = exportMap.get(normalizedBlockLookupKey(enumName)) || enumName;
			if (shouldSkipVanillaBlockIdentifier(enumName) || shouldSkipVanillaBlockIdentifier(displaySource)) {
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
		const previewAssets = yield* extractVanillaPreviewAssets(source.sourcePath, records, options);
		return assignRenderedBlockPreviewsToRecords(records, previewAssets, options);
	} catch (error) {
		log.warn(`Failed to index vanilla TerraTech blocks from ${source.sourcePath}`);
		log.warn(error);
		return [];
	}
});

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
	const createTextAssetOnlyOutcomes = Effect.fnUntraced(function* (
		sourcePaths: readonly string[]
	): Effect.fn.Return<Map<string, BlockLookupBundleExtractionOutcome>, unknown> {
		const textAssetsBySourcePath = yield* dependencies.extractBundleTextAssets!(sourcePaths);
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
	});
	return {
		extractRecords: Effect.fnUntraced(function* (sources, options): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
			const sourcePaths = sources.map((source) => source.sourcePath);
			const blockLookupOutcomesBySourcePath = dependencies.extractBlockLookupBundleOutcomes
				? yield* dependencies.extractBlockLookupBundleOutcomes(sourcePaths)
				: dependencies.extractBundleTextAssets
					? yield* createTextAssetOnlyOutcomes(sourcePaths)
					: yield* extractBlockLookupBundleOutcomes(sourcePaths, { previewCacheDir: options?.previewCacheDir });
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			for (const source of sources) {
				const outcome = blockLookupOutcomesBySourcePath.get(source.sourcePath);
				const records = createBlockLookupRecordsFromTextAssets(source, outcome?.textAssets ?? []);
				recordsBySourcePath.set(source.sourcePath, assignRenderedBlockPreviewsToRecords(records, outcome?.previewAssets ?? [], options));
			}
			return recordsBySourcePath;
		})
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
		extractRecords: Effect.fnUntraced(function* (
			sources: readonly BlockLookupSourceRecord[],
			options?: BlockLookupSourceExtractionOptions
		): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
			const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
			const sourcesByKind = new Map<BlockLookupSourceRecord['sourceKind'], BlockLookupSourceRecord[]>();
			for (const source of sources) {
				const kindSources = sourcesByKind.get(source.sourceKind) ?? [];
				kindSources.push(source);
				sourcesByKind.set(source.sourceKind, kindSources);
			}

			for (const [sourceKind, kindSources] of sourcesByKind) {
				const adapter = sourceAdapters[sourceKind];
				const extractedRecords = yield* options ? adapter.extractRecords(kindSources, options) : adapter.extractRecords(kindSources);
				for (const source of kindSources) {
					recordsBySourcePath.set(source.sourcePath, extractedRecords.get(source.sourcePath) ?? []);
				}
			}

			return recordsBySourcePath;
		})
	};
}

export const extractRecordsFromSources = Effect.fnUntraced(function* (
	sources: readonly BlockLookupSourceRecord[],
	adapters: BlockLookupSourceExtractionAdapters = {},
	options?: BlockLookupSourceExtractionOptions
): Effect.fn.Return<Map<string, BlockLookupRecord[]>, unknown> {
	return yield* createBlockLookupSourceExtractionRouter(adapters).extractRecords(sources, options);
});
