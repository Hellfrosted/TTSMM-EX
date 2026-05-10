import fs from 'fs';
import path from 'path';
import childProcess from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildBlockLookupAliases,
	buildBlockLookupIndex,
	extractNuterraBlocksFromText,
	readBlockLookupIndex,
	searchBlockLookupIndex
} from '../../main/block-lookup';
import { extractBundleTextAssetOutcomes, extractBundleTextAssets } from '../../main/block-lookup-bundle-text-assets';
import { createBlockLookupBundleSourceExtractionAdapter } from '../../main/block-lookup-extraction';
import { createBlockLookupIndexBuild } from '../../main/block-lookup-index-build';
import { createBlockLookupIndexModule } from '../../main/block-lookup-indexer';
import { createBlockLookupIndexPlan } from '../../main/block-lookup-index-planner';
import { createBlockLookupRecordsFromTextAssets } from '../../main/block-lookup-nuterra-text';
import { searchBlockLookupRecords } from '../../main/block-lookup-search';
import {
	MAX_BLOCK_LOOKUP_JSON_DEPTH,
	collectBlockLookupSources,
	type BlockLookupSourceRecord
} from '../../main/block-lookup-source-discovery';
import { indexBlockLookupSources } from '../../main/block-lookup-source-indexing';
import { registerBlockLookupHandlers } from '../../main/ipc/block-lookup-handlers';
import Steamworks from '../../main/steamworks';
import type { BlockLookupRecord } from '../../shared/block-lookup';
import { ValidChannel } from '../../shared/ipc';
import { createTempDir, createValidIpcEvent } from './test-utils';

beforeEach(() => {
	vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
	vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
	vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

function createBlockLookupHandlerHarness() {
	const userDataPath = createTempDir('ttsmm-block-lookup-ipc-');
	const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
	const ipcMain = {
		handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
			handlers.set(channel, handler);
		})
	};

	registerBlockLookupHandlers(ipcMain as never, {
		getUserDataPath: () => userDataPath
	});

	const invoke = <T>(channel: ValidChannel, ...args: unknown[]) => {
		const handler = handlers.get(channel);
		if (!handler) {
			throw new Error(`Missing handler for ${channel}`);
		}
		return handler(createValidIpcEvent(), ...args) as Promise<T>;
	};

	return {
		invoke,
		userDataPath
	};
}

function createTestBlockLookupRecord(overrides: Partial<BlockLookupRecord> = {}): BlockLookupRecord {
	const blockName = overrides.blockName ?? 'Alpha Cannon';
	const modTitle = overrides.modTitle ?? 'Test Blocks';
	const sourcePath = overrides.sourcePath ?? path.normalize('/mods/TestCannon.json');
	const preferredAlias = overrides.preferredAlias ?? `${blockName.replace(/\s/g, '_')}(${modTitle.replace(/\s/g, '_')})`;

	return {
		blockId: overrides.blockId ?? '42',
		blockName,
		fallbackAlias: overrides.fallbackAlias ?? preferredAlias,
		fallbackSpawnCommand: overrides.fallbackSpawnCommand ?? `SpawnBlock ${preferredAlias}`,
		internalName: overrides.internalName ?? blockName.replace(/\s/g, ''),
		modTitle,
		preferredAlias,
		sourceKind: overrides.sourceKind ?? 'json',
		sourcePath,
		spawnCommand: overrides.spawnCommand ?? `SpawnBlock ${preferredAlias}`,
		workshopId: overrides.workshopId ?? '12345'
	};
}

describe('block lookup index', () => {
	it('builds observed and strict SpawnBlock aliases', () => {
		expect(buildBlockLookupAliases('Venture Pyrobat Flare/Chaff Dispenser', 'Active Defenses')).toEqual({
			preferredAlias: 'Venture_Pyrobat_Flare/Chaff_Dispenser(Active_Defenses)',
			fallbackAlias: 'Venture_Pyrobat_Flare_Chaff_Dispenser(Active_Defenses)'
		});
	});

	it('extracts Nuterra block metadata from text assets', () => {
		const blocks = extractNuterraBlocksFromText(
			'{"m_Name":"HE_Flak","Type":"NuterraBlock","Name":"Hawkeye Quad 20mm ORION","ID":10005}',
			'fallback'
		);

		expect(blocks).toEqual([
			{
				blockName: 'Hawkeye Quad 20mm ORION',
				blockId: '10005',
				internalName: 'HE_Flak'
			}
		]);
	});

	it('indexes JSON block sources through the Block Lookup source indexing interface', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-json-');
		const jsonPath = path.join(tempDir, 'TestCannon.json');
		fs.writeFileSync(jsonPath, '{"Type":"NuterraBlock","Name":"Alpha Cannon","ID":42}', 'utf8');
		const stats = fs.statSync(jsonPath);

		const result = await indexBlockLookupSources([
			{
				modTitle: 'Test Blocks',
				mtimeMs: stats.mtimeMs,
				size: stats.size,
				sourceKind: 'json',
				sourcePath: jsonPath,
				workshopId: '12345'
			}
		]);

		expect(result.recordsBySourcePath.get(jsonPath)).toEqual([
			expect.objectContaining({
				blockName: 'Alpha Cannon',
				internalName: 'TestCannon',
				sourceKind: 'json',
				spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
			})
		]);
	});

	it('indexes vanilla TerraTech sources through the Block Lookup source indexing interface', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-vanilla-');
		const assemblyPath = path.join(tempDir, 'TerraTechWin64_Data', 'Managed', 'Assembly-CSharp.dll');
		const exportDir = path.join(tempDir, '_Export', 'BlockJson');
		fs.mkdirSync(path.dirname(assemblyPath), { recursive: true });
		fs.mkdirSync(exportDir, { recursive: true });
		fs.writeFileSync(assemblyPath, '');
		fs.writeFileSync(path.join(exportDir, 'HE_Cab_prefab.json'), '{}', 'utf8');
		vi.spyOn(childProcess, 'execFile').mockImplementation(((_file, _args, _options, callback) => {
			if (typeof callback === 'function') {
				callback(null, '["HE_Cab"]', '');
			}
			return {} as childProcess.ChildProcess;
		}) as typeof childProcess.execFile);
		const stats = fs.statSync(assemblyPath);

		const result = await indexBlockLookupSources([
			{
				modTitle: 'TerraTech',
				mtimeMs: stats.mtimeMs,
				size: stats.size,
				sourceKind: 'vanilla',
				sourcePath: assemblyPath,
				workshopId: 'vanilla'
			}
		]);

		expect(result.records).toEqual([
			expect.objectContaining({
				blockName: 'HE Cab',
				internalName: 'HE_Cab',
				sourceKind: 'vanilla',
				spawnCommand: 'SpawnBlock HE_Cab'
			})
		]);
	});

	it('routes source extraction through source-kind adapters while preserving source order', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-router-');
		const bundleSource: BlockLookupSourceRecord = {
			modTitle: 'Bundle Blocks',
			mtimeMs: 3,
			size: 30,
			sourceKind: 'bundle',
			sourcePath: path.join(tempDir, 'BundleBlocks_bundle'),
			workshopId: 'bundle'
		};
		const secondBundleSource: BlockLookupSourceRecord = {
			modTitle: 'Second Bundle Blocks',
			mtimeMs: 4,
			size: 40,
			sourceKind: 'bundle',
			sourcePath: path.join(tempDir, 'SecondBundleBlocks_bundle'),
			workshopId: 'second-bundle'
		};
		const jsonSource: BlockLookupSourceRecord = {
			modTitle: 'JSON Blocks',
			mtimeMs: 1,
			size: 10,
			sourceKind: 'json',
			sourcePath: path.join(tempDir, 'JsonBlock.json'),
			workshopId: 'json'
		};
		const vanillaSource: BlockLookupSourceRecord = {
			modTitle: 'TerraTech',
			mtimeMs: 2,
			size: 20,
			sourceKind: 'vanilla',
			sourcePath: path.join(tempDir, 'TerraTechWin64_Data', 'Managed', 'Assembly-CSharp.dll'),
			workshopId: 'vanilla'
		};
		const createRoutingAdapter = (blockName: string) => ({
			extractRecords: vi.fn(async (sources: readonly BlockLookupSourceRecord[]) => {
				return new Map(
					sources.map((source) => [
						source.sourcePath,
						[
							createTestBlockLookupRecord({
								blockName: `${blockName} ${source.workshopId}`,
								modTitle: source.modTitle,
								sourceKind: source.sourceKind,
								sourcePath: source.sourcePath,
								workshopId: source.workshopId
							})
						]
					])
				);
			})
		});
		const bundleAdapter = createRoutingAdapter('Bundle Routed');
		const jsonAdapter = createRoutingAdapter('JSON Routed');
		const vanillaAdapter = createRoutingAdapter('Vanilla Routed');

		const result = await indexBlockLookupSources([bundleSource, jsonSource, secondBundleSource, vanillaSource], {
			sourceExtractionAdapters: {
				bundle: bundleAdapter,
				json: jsonAdapter,
				vanilla: vanillaAdapter
			}
		});

		expect(bundleAdapter.extractRecords).toHaveBeenCalledWith([bundleSource, secondBundleSource]);
		expect(jsonAdapter.extractRecords).toHaveBeenCalledWith([jsonSource]);
		expect(vanillaAdapter.extractRecords).toHaveBeenCalledWith([vanillaSource]);
		expect(result.records.map((record) => record.blockName)).toEqual([
			'Bundle Routed bundle',
			'JSON Routed json',
			'Bundle Routed second-bundle',
			'Vanilla Routed vanilla'
		]);
	});

	it('keeps source extraction failures local to source indexing', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-failure-');
		const goodPath = path.join(tempDir, 'GoodBlock.json');
		const missingPath = path.join(tempDir, 'MissingBlock.json');
		fs.writeFileSync(goodPath, '{"Type":"NuterraBlock","Name":"Good Block","ID":7}', 'utf8');
		const goodStats = fs.statSync(goodPath);

		const result = await indexBlockLookupSources([
			{
				modTitle: 'Bad Blocks',
				mtimeMs: 0,
				size: 0,
				sourceKind: 'json',
				sourcePath: missingPath,
				workshopId: 'bad'
			},
			{
				modTitle: 'Good Blocks',
				mtimeMs: goodStats.mtimeMs,
				size: goodStats.size,
				sourceKind: 'json',
				sourcePath: goodPath,
				workshopId: 'good'
			}
		]);

		expect(result.recordsBySourcePath.get(missingPath)).toEqual([]);
		expect(result.recordsBySourcePath.get(goodPath)).toEqual([expect.objectContaining({ blockName: 'Good Block' })]);
	});

	it('indexes bundle sources through the bundle source extraction adapter', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-bundle-');
		const bundlePath = path.join(tempDir, 'BundleBlocks_bundle');
		fs.writeFileSync(bundlePath, 'bundle', 'utf8');
		const stats = fs.statSync(bundlePath);
		const extractBundleTextAssetsAdapter = vi.fn(async () => {
			return new Map([
				[
					bundlePath,
					[
						{
							assetName: 'BundleBlocks',
							text: '{"m_Name":"Bundle_Block_Internal","Type":"NuterraBlock","Name":"Bundle Block","ID":77}'
						}
					]
				]
			]);
		});

		const result = await indexBlockLookupSources(
			[
				{
					modTitle: 'Bundle Blocks',
					mtimeMs: stats.mtimeMs,
					size: stats.size,
					sourceKind: 'bundle',
					sourcePath: bundlePath,
					workshopId: '24680'
				}
			],
			{
				sourceExtractionAdapters: {
					bundle: createBlockLookupBundleSourceExtractionAdapter({ extractBundleTextAssets: extractBundleTextAssetsAdapter })
				}
			}
		);

		expect(extractBundleTextAssetsAdapter).toHaveBeenCalledWith([bundlePath]);
		expect(result.records).toEqual([
			expect.objectContaining({
				blockName: 'Bundle Block',
				internalName: 'Bundle_Block_Internal',
				sourceKind: 'bundle'
			})
		]);
	});

	it('indexes mixed JSON and multiple bundle sources through one source indexing call', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-mixed-');
		const jsonPath = path.join(tempDir, 'JsonBlock.json');
		const firstBundlePath = path.join(tempDir, 'FirstBundle_bundle');
		const secondBundlePath = path.join(tempDir, 'SecondBundle_bundle');
		fs.writeFileSync(jsonPath, '{"Type":"NuterraBlock","Name":"JSON Block","ID":10}', 'utf8');
		fs.writeFileSync(firstBundlePath, 'bundle-a', 'utf8');
		fs.writeFileSync(secondBundlePath, 'bundle-b', 'utf8');
		const jsonStats = fs.statSync(jsonPath);
		const firstBundleStats = fs.statSync(firstBundlePath);
		const secondBundleStats = fs.statSync(secondBundlePath);
		const extractBundleTextAssetsAdapter = vi.fn(async () => {
			return new Map([
				[
					firstBundlePath,
					[
						{
							assetName: 'FirstBundle',
							text: '{"m_Name":"First_Bundle_Internal","Type":"NuterraBlock","Name":"First Bundle Block","ID":11}'
						}
					]
				],
				[
					secondBundlePath,
					[
						{
							assetName: 'SecondBundle',
							text: '{"m_Name":"Second_Bundle_Internal","Type":"NuterraBlock","Name":"Second Bundle Block","ID":12}'
						}
					]
				]
			]);
		});

		const result = await indexBlockLookupSources(
			[
				{
					modTitle: 'JSON Blocks',
					mtimeMs: jsonStats.mtimeMs,
					size: jsonStats.size,
					sourceKind: 'json',
					sourcePath: jsonPath,
					workshopId: 'json'
				},
				{
					modTitle: 'First Bundle',
					mtimeMs: firstBundleStats.mtimeMs,
					size: firstBundleStats.size,
					sourceKind: 'bundle',
					sourcePath: firstBundlePath,
					workshopId: 'first'
				},
				{
					modTitle: 'Second Bundle',
					mtimeMs: secondBundleStats.mtimeMs,
					size: secondBundleStats.size,
					sourceKind: 'bundle',
					sourcePath: secondBundlePath,
					workshopId: 'second'
				}
			],
			{
				sourceExtractionAdapters: {
					bundle: createBlockLookupBundleSourceExtractionAdapter({ extractBundleTextAssets: extractBundleTextAssetsAdapter })
				}
			}
		);

		expect(extractBundleTextAssetsAdapter).toHaveBeenCalledOnce();
		expect(extractBundleTextAssetsAdapter).toHaveBeenCalledWith([firstBundlePath, secondBundlePath]);
		expect(result.recordsBySourcePath.get(jsonPath)).toEqual([expect.objectContaining({ blockName: 'JSON Block', sourceKind: 'json' })]);
		expect(result.recordsBySourcePath.get(firstBundlePath)).toEqual([
			expect.objectContaining({ blockName: 'First Bundle Block', sourceKind: 'bundle' })
		]);
		expect(result.recordsBySourcePath.get(secondBundlePath)).toEqual([
			expect.objectContaining({ blockName: 'Second Bundle Block', sourceKind: 'bundle' })
		]);
		expect(result.records).toHaveLength(3);
	});

	it('skips only bundle sources with missing TextAssets from the batch result', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-bundle-failure-');
		const failedBundlePath = path.join(tempDir, 'FailedBundle_bundle');
		const goodBundlePath = path.join(tempDir, 'GoodBundle_bundle');
		fs.writeFileSync(failedBundlePath, 'UnityFS failed bundle content with NuterraBlock text that should not be parsed directly', 'utf8');
		fs.writeFileSync(goodBundlePath, 'bundle', 'utf8');
		const failedStats = fs.statSync(failedBundlePath);
		const goodStats = fs.statSync(goodBundlePath);
		const extractBundleTextAssetsAdapter = vi.fn(async () => {
			return new Map([
				[failedBundlePath, []],
				[
					goodBundlePath,
					[
						{
							assetName: 'GoodBundle',
							text: '{"m_Name":"Good_Bundle_Internal","Type":"NuterraBlock","Name":"Good Bundle Block","ID":13}'
						}
					]
				]
			]);
		});

		const result = await indexBlockLookupSources(
			[
				{
					modTitle: 'Failed Bundle',
					mtimeMs: failedStats.mtimeMs,
					size: failedStats.size,
					sourceKind: 'bundle',
					sourcePath: failedBundlePath,
					workshopId: 'failed'
				},
				{
					modTitle: 'Good Bundle',
					mtimeMs: goodStats.mtimeMs,
					size: goodStats.size,
					sourceKind: 'bundle',
					sourcePath: goodBundlePath,
					workshopId: 'good'
				}
			],
			{
				sourceExtractionAdapters: {
					bundle: createBlockLookupBundleSourceExtractionAdapter({ extractBundleTextAssets: extractBundleTextAssetsAdapter })
				}
			}
		);

		expect(result.recordsBySourcePath.get(failedBundlePath)).toEqual([]);
		expect(result.recordsBySourcePath.get(goodBundlePath)).toEqual([
			expect.objectContaining({ blockName: 'Good Bundle Block', sourceKind: 'bundle' })
		]);
		expect(result.records).toEqual([expect.objectContaining({ blockName: 'Good Bundle Block' })]);
	});

	it('indexes bundle sources from normalized extraction outcomes', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-bundle-outcomes-');
		const emptyBundlePath = path.join(tempDir, 'EmptyBundle_bundle');
		const failedBundlePath = path.join(tempDir, 'FailedBundle_bundle');
		const goodBundlePath = path.join(tempDir, 'GoodBundle_bundle');
		fs.writeFileSync(emptyBundlePath, 'empty bundle', 'utf8');
		fs.writeFileSync(failedBundlePath, 'failed bundle', 'utf8');
		fs.writeFileSync(goodBundlePath, 'good bundle', 'utf8');
		const emptyStats = fs.statSync(emptyBundlePath);
		const failedStats = fs.statSync(failedBundlePath);
		const goodStats = fs.statSync(goodBundlePath);
		const extractBundleTextAssetOutcomesAdapter = vi.fn(async () => {
			return new Map([
				[
					emptyBundlePath,
					{
						issues: [],
						sourcePath: emptyBundlePath,
						status: 'success' as const,
						textAssets: []
					}
				],
				[
					failedBundlePath,
					{
						issues: ['Unable to read bundle TextAssets'],
						sourcePath: failedBundlePath,
						status: 'issue' as const,
						textAssets: []
					}
				],
				[
					goodBundlePath,
					{
						issues: [],
						sourcePath: goodBundlePath,
						status: 'success' as const,
						textAssets: [
							{
								assetName: 'GoodBundle',
								text: '{"m_Name":"Good_Bundle_Internal","Type":"NuterraBlock","Name":"Good Bundle Block","ID":13}'
							}
						]
					}
				]
			]);
		});

		const result = await indexBlockLookupSources(
			[
				{
					modTitle: 'Empty Bundle',
					mtimeMs: emptyStats.mtimeMs,
					size: emptyStats.size,
					sourceKind: 'bundle',
					sourcePath: emptyBundlePath,
					workshopId: 'empty'
				},
				{
					modTitle: 'Failed Bundle',
					mtimeMs: failedStats.mtimeMs,
					size: failedStats.size,
					sourceKind: 'bundle',
					sourcePath: failedBundlePath,
					workshopId: 'failed'
				},
				{
					modTitle: 'Good Bundle',
					mtimeMs: goodStats.mtimeMs,
					size: goodStats.size,
					sourceKind: 'bundle',
					sourcePath: goodBundlePath,
					workshopId: 'good'
				}
			],
			{
				sourceExtractionAdapters: {
					bundle: createBlockLookupBundleSourceExtractionAdapter({
						extractBundleTextAssetOutcomes: extractBundleTextAssetOutcomesAdapter
					})
				}
			}
		);

		expect(extractBundleTextAssetOutcomesAdapter).toHaveBeenCalledWith([emptyBundlePath, failedBundlePath, goodBundlePath]);
		expect(result.recordsBySourcePath.get(emptyBundlePath)).toEqual([]);
		expect(result.recordsBySourcePath.get(failedBundlePath)).toEqual([]);
		expect(result.recordsBySourcePath.get(goodBundlePath)).toEqual([
			expect.objectContaining({ blockName: 'Good Bundle Block', sourceKind: 'bundle' })
		]);
	});

	it('discovers JSON and bundle sources from loaded mod directories', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-sources-');
		const modDir = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920', '13579');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const nestedJsonDir = path.join(blockJsonDir, 'Nested');
		const bundlePath = path.join(modDir, 'TestPack_bundle');
		const jsonPath = path.join(nestedJsonDir, 'NestedBlock.json');
		fs.mkdirSync(nestedJsonDir, { recursive: true });
		fs.writeFileSync(bundlePath, 'bundle data', 'utf8');
		fs.writeFileSync(jsonPath, '{"Type":"NuterraBlock","Name":"Nested Block"}', 'utf8');
		fs.writeFileSync(path.join(modDir, 'ignored.txt'), 'ignore me', 'utf8');

		const result = collectBlockLookupSources({
			modSources: [
				{
					uid: 'workshop:13579',
					name: 'Source Test',
					path: modDir,
					workshopID: '13579'
				}
			]
		});

		expect(result.sources.map((source) => source.sourcePath)).toEqual([path.normalize(jsonPath), path.normalize(bundlePath)].sort());
		expect(result.sources).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ modTitle: 'Source Test', sourceKind: 'json', workshopId: '13579' }),
				expect.objectContaining({ modTitle: 'Source Test', sourceKind: 'bundle', workshopId: '13579' })
			])
		);
	});

	it('rejects BlockJSON roots that resolve outside the mod directory', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-symlink-root-');
		const modDir = path.join(tempDir, 'LoadedMod');
		const outsideDir = path.join(tempDir, 'OutsideJson');
		const escapedJsonPath = path.join(outsideDir, 'EscapedBlock.json');
		fs.mkdirSync(modDir, { recursive: true });
		fs.mkdirSync(outsideDir, { recursive: true });
		fs.writeFileSync(escapedJsonPath, '{"Type":"NuterraBlock","Name":"Escaped Block"}', 'utf8');
		fs.symlinkSync(outsideDir, path.join(modDir, 'BlockJSON'), process.platform === 'win32' ? 'junction' : 'dir');

		const result = collectBlockLookupSources({
			modSources: [
				{
					uid: 'local:LoadedMod',
					name: 'Loaded Mod',
					path: modDir
				}
			]
		});

		expect(result.sources.map((source) => source.sourcePath)).not.toContain(path.normalize(escapedJsonPath));
		expect(result.sources).toHaveLength(0);
	});

	it('accepts BlockJSON roots that resolve inside the mod directory', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-contained-symlink-root-');
		const modDir = path.join(tempDir, 'LoadedMod');
		const containedDir = path.join(modDir, 'ContainedJson');
		const symlinkJsonPath = path.join(modDir, 'BlockJSON', 'ContainedBlock.json');
		fs.mkdirSync(containedDir, { recursive: true });
		fs.writeFileSync(path.join(containedDir, 'ContainedBlock.json'), '{"Type":"NuterraBlock","Name":"Contained Block"}', 'utf8');
		fs.symlinkSync(containedDir, path.join(modDir, 'BlockJSON'), process.platform === 'win32' ? 'junction' : 'dir');

		const result = collectBlockLookupSources({
			modSources: [
				{
					uid: 'local:LoadedMod',
					name: 'Loaded Mod',
					path: modDir
				}
			]
		});

		expect(result.sources.map((source) => source.sourcePath)).toEqual([path.normalize(symlinkJsonPath)]);
	});

	it('rejects nested JSON directories that resolve outside the mod directory', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-nested-symlink-');
		const modDir = path.join(tempDir, 'LoadedMod');
		const insideDir = path.join(modDir, 'Json');
		const outsideDir = path.join(tempDir, 'OutsideJson');
		const localJsonPath = path.join(insideDir, 'LocalBlock.json');
		const escapedJsonPath = path.join(outsideDir, 'EscapedBlock.json');
		fs.mkdirSync(insideDir, { recursive: true });
		fs.mkdirSync(outsideDir, { recursive: true });
		fs.writeFileSync(localJsonPath, '{"Type":"NuterraBlock","Name":"Local Block"}', 'utf8');
		fs.writeFileSync(escapedJsonPath, '{"Type":"NuterraBlock","Name":"Escaped Block"}', 'utf8');
		fs.symlinkSync(outsideDir, path.join(modDir, 'EscapedJson'), process.platform === 'win32' ? 'junction' : 'dir');

		const result = collectBlockLookupSources({
			modSources: [
				{
					uid: 'local:LoadedMod',
					name: 'Loaded Mod',
					path: modDir
				}
			]
		});

		expect(result.sources.map((source) => source.sourcePath)).toEqual([path.normalize(localJsonPath)]);
		expect(result.sources.map((source) => source.sourcePath)).not.toContain(path.normalize(escapedJsonPath));
	});

	it('stops BlockJSON recursion beyond the configured depth limit', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-depth-limit-');
		const modDir = path.join(tempDir, 'LoadedMod');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const rootJsonPath = path.join(blockJsonDir, 'RootBlock.json');
		let deepDir = blockJsonDir;
		for (let depth = 0; depth <= MAX_BLOCK_LOOKUP_JSON_DEPTH; depth += 1) {
			deepDir = path.join(deepDir, `d${depth}`);
		}
		const deepJsonPath = path.join(deepDir, 'TooDeepBlock.json');
		fs.mkdirSync(deepDir, { recursive: true });
		fs.writeFileSync(rootJsonPath, '{"Type":"NuterraBlock","Name":"Root Block"}', 'utf8');
		fs.writeFileSync(deepJsonPath, '{"Type":"NuterraBlock","Name":"Too Deep Block"}', 'utf8');

		const result = collectBlockLookupSources({
			modSources: [
				{
					uid: 'local:LoadedMod',
					name: 'Loaded Mod',
					path: modDir
				}
			]
		});

		expect(result.sources.map((source) => source.sourcePath)).toEqual([path.normalize(rootJsonPath)]);
	});

	it('indexes JSON block sources and reuses unchanged records', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		fs.mkdirSync(blockJsonDir, { recursive: true });
		fs.writeFileSync(
			path.join(blockJsonDir, 'TestCannon.json'),
			JSON.stringify({
				Type: 'NuterraBlock',
				Name: 'Alpha Cannon',
				ID: 42
			}),
			'utf8'
		);

		const firstBuild = await buildBlockLookupIndex(userDataPath, {
			workshopRoot,
			modSources: [
				{
					uid: 'workshop:12345',
					name: 'Test Blocks',
					path: modDir,
					workshopID: '12345'
				}
			]
		});

		expect(firstBuild.settings.workshopRoot).toBe(workshopRoot);
		expect(firstBuild.stats.blocks).toBe(1);
		expect(firstBuild.stats.scanned).toBe(1);

		const searchResult = searchBlockLookupIndex(userDataPath, 'alpha cannon');
		expect(searchResult.rows).toHaveLength(1);
		expect(searchResult.rows[0]).toMatchObject({
			blockName: 'Alpha Cannon',
			internalName: 'TestCannon',
			modTitle: 'Test Blocks',
			spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)',
			fallbackSpawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
		});

		const secondBuild = await buildBlockLookupIndex(userDataPath, {
			workshopRoot,
			modSources: [
				{
					uid: 'workshop:12345',
					name: 'Test Blocks',
					path: modDir,
					workshopID: '12345'
				}
			]
		});

		expect(secondBuild.stats.blocks).toBe(1);
		expect(secondBuild.stats.skipped).toBe(1);
		expect(secondBuild.stats.scanned).toBe(0);
	});

	it('executes the Block Lookup Index build recipe without owning persisted storage', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-build-');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const blockJsonPath = path.join(blockJsonDir, 'TestCannon.json');
		fs.mkdirSync(blockJsonDir, { recursive: true });
		fs.writeFileSync(
			blockJsonPath,
			JSON.stringify({
				Type: 'NuterraBlock',
				Name: 'Alpha Cannon',
				ID: 42
			}),
			'utf8'
		);
		const emptyIndex = {
			version: 1,
			builtAt: '',
			sources: [],
			records: []
		} as const;

		const firstBuild = await createBlockLookupIndexBuild(emptyIndex, {
			workshopRoot,
			modSources: [
				{
					uid: 'workshop:12345',
					name: 'Test Blocks',
					path: modDir,
					workshopID: '12345'
				}
			]
		});
		const secondBuild = await createBlockLookupIndexBuild(firstBuild.index, {
			workshopRoot,
			modSources: [
				{
					uid: 'workshop:12345',
					name: 'Test Blocks',
					path: modDir,
					workshopID: '12345'
				}
			]
		});

		expect(firstBuild.settings).toEqual({ workshopRoot });
		expect(firstBuild.stats).toMatchObject({
			sources: 1,
			scanned: 1,
			skipped: 0,
			removed: 0,
			blocks: 1,
			updatedBlocks: 1
		});
		expect(firstBuild.index.records[0]).toMatchObject({
			blockName: 'Alpha Cannon',
			sourcePath: path.normalize(blockJsonPath),
			spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
		});
		expect(secondBuild.stats).toMatchObject({
			scanned: 0,
			skipped: 1,
			blocks: 1,
			updatedBlocks: 0
		});
		expect(secondBuild.index.records).toEqual(firstBuild.index.records);
	});

	it('keeps source extraction out of unchanged source reuse and scans again on force rebuild', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-reuse-adapter-');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const blockJsonPath = path.join(blockJsonDir, 'TestCannon.json');
		fs.mkdirSync(blockJsonDir, { recursive: true });
		fs.writeFileSync(blockJsonPath, '{"Type":"NuterraBlock","Name":"Alpha Cannon","ID":42}', 'utf8');
		const request = {
			workshopRoot,
			modSources: [
				{
					uid: 'workshop:12345',
					name: 'Test Blocks',
					path: modDir,
					workshopID: '12345'
				}
			]
		};

		const firstBuild = await createBlockLookupIndexBuild({ version: 1, builtAt: '', sources: [], records: [] }, request);
		const reuseIndexer = vi.fn(async () => ({
			records: [],
			recordsBySourcePath: new Map<string, BlockLookupRecord[]>()
		}));

		const reusedBuild = await createBlockLookupIndexBuild(firstBuild.index, request, {
			indexBlockLookupSources: reuseIndexer
		});

		expect(reuseIndexer).not.toHaveBeenCalled();
		expect(reusedBuild.stats).toMatchObject({
			scanned: 0,
			skipped: 1,
			updatedBlocks: 0
		});

		const forceIndexer = vi.fn(async (sources) => {
			const source = sources[0]!;
			const record: BlockLookupRecord = {
				blockId: '43',
				blockName: 'Forced Block',
				fallbackAlias: 'Forced_Block(Test_Blocks)',
				fallbackSpawnCommand: 'SpawnBlock Forced_Block(Test_Blocks)',
				internalName: 'ForcedBlock',
				modTitle: source.modTitle,
				preferredAlias: 'Forced_Block(Test_Blocks)',
				sourceKind: source.sourceKind,
				sourcePath: source.sourcePath,
				spawnCommand: 'SpawnBlock Forced_Block(Test_Blocks)',
				workshopId: source.workshopId
			};
			return {
				records: [record],
				recordsBySourcePath: new Map([[source.sourcePath, [record]]])
			};
		});

		const forceBuild = await createBlockLookupIndexBuild(
			firstBuild.index,
			{ ...request, forceRebuild: true },
			{
				indexBlockLookupSources: forceIndexer
			}
		);

		expect(forceIndexer).toHaveBeenCalledOnce();
		expect(forceBuild.stats).toMatchObject({
			scanned: 1,
			skipped: 0,
			updatedBlocks: 1
		});
		expect(forceBuild.index.records).toEqual([expect.objectContaining({ blockName: 'Forced Block' })]);
	});

	it('preserves mixed scanned, skipped, removed, and updated block stats in the build flow', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-mixed-stats-');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const unchangedModDir = path.join(workshopRoot, '111');
		const changedModDir = path.join(workshopRoot, '222');
		const unchangedJsonDir = path.join(unchangedModDir, 'BlockJSON');
		const changedJsonDir = path.join(changedModDir, 'BlockJSON');
		const unchangedPath = path.join(unchangedJsonDir, 'UnchangedBlock.json');
		const changedPath = path.join(changedJsonDir, 'ChangedBlock.json');
		const removedPath = path.join(tempDir, 'RemovedBlock.json');
		fs.mkdirSync(unchangedJsonDir, { recursive: true });
		fs.mkdirSync(changedJsonDir, { recursive: true });
		fs.writeFileSync(unchangedPath, '{"Type":"NuterraBlock","Name":"Unchanged Block","ID":1}', 'utf8');
		fs.writeFileSync(changedPath, '{"Type":"NuterraBlock","Name":"Changed Block","ID":2}', 'utf8');
		const unchangedStats = fs.statSync(unchangedPath);
		const changedStats = fs.statSync(changedPath);
		const reusedRecord = createTestBlockLookupRecord({
			blockId: '1',
			blockName: 'Unchanged Block',
			internalName: 'UnchangedBlock',
			modTitle: 'Unchanged Blocks',
			sourcePath: path.normalize(unchangedPath),
			workshopId: '111'
		});
		const removedRecord = createTestBlockLookupRecord({
			blockId: '0',
			blockName: 'Removed Block',
			internalName: 'RemovedBlock',
			modTitle: 'Removed Blocks',
			sourcePath: path.normalize(removedPath),
			workshopId: '000'
		});
		const changedRecords = [
			createTestBlockLookupRecord({
				blockId: '2',
				blockName: 'Changed Block',
				internalName: 'ChangedBlock',
				modTitle: 'Changed Blocks',
				sourcePath: path.normalize(changedPath),
				workshopId: '222'
			}),
			createTestBlockLookupRecord({
				blockId: '3',
				blockName: 'Changed Extra Block',
				internalName: 'ChangedExtraBlock',
				modTitle: 'Changed Blocks',
				sourcePath: path.normalize(changedPath),
				workshopId: '222'
			})
		];
		const indexBlockLookupSourcesAdapter = vi.fn(async () => ({
			records: changedRecords,
			recordsBySourcePath: new Map([[path.normalize(changedPath), changedRecords]])
		}));

		const build = await createBlockLookupIndexBuild(
			{
				version: 1,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: [
					{
						sourcePath: path.normalize(unchangedPath),
						workshopId: '111',
						modTitle: 'Unchanged Blocks',
						sourceKind: 'json',
						size: unchangedStats.size,
						mtimeMs: unchangedStats.mtimeMs
					},
					{
						sourcePath: path.normalize(changedPath),
						workshopId: '222',
						modTitle: 'Changed Blocks',
						sourceKind: 'json',
						size: changedStats.size - 1,
						mtimeMs: changedStats.mtimeMs
					},
					{
						sourcePath: path.normalize(removedPath),
						workshopId: '000',
						modTitle: 'Removed Blocks',
						sourceKind: 'json',
						size: 1,
						mtimeMs: 1
					}
				],
				records: [reusedRecord, removedRecord]
			},
			{
				workshopRoot,
				modSources: [
					{
						uid: 'workshop:111',
						name: 'Unchanged Blocks',
						path: unchangedModDir,
						workshopID: '111'
					},
					{
						uid: 'workshop:222',
						name: 'Changed Blocks',
						path: changedModDir,
						workshopID: '222'
					}
				]
			},
			{ indexBlockLookupSources: indexBlockLookupSourcesAdapter }
		);

		expect(indexBlockLookupSourcesAdapter).toHaveBeenCalledWith([
			expect.objectContaining({ sourcePath: path.normalize(changedPath), workshopId: '222' })
		]);
		expect(build.stats).toMatchObject({
			sources: 2,
			scanned: 1,
			skipped: 1,
			removed: 1,
			blocks: 3,
			updatedBlocks: 2
		});
		expect(build.index.records).toEqual([reusedRecord, ...changedRecords]);
		expect(build.index.records).not.toContain(removedRecord);
	});

	it('uses native bundle text extraction without Python dependencies', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-bundle-');
		const userDataPath = path.join(tempDir, 'user-data');
		const modDir = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920', '24680');
		const bundlePath = path.join(modDir, 'BundleBlocks_bundle');
		fs.mkdirSync(modDir, { recursive: true });
		fs.writeFileSync(bundlePath, 'UnityFS\0{"m_Name":"Bundle_Block_Internal","Type":"NuterraBlock","Name":"Bundle Block","ID":77}', 'utf8');

		await buildBlockLookupIndex(userDataPath, {
			modSources: [
				{
					uid: 'workshop:24680',
					name: 'Bundle Blocks',
					path: modDir,
					workshopID: '24680'
				}
			]
		});

		const searchResult = searchBlockLookupIndex(userDataPath, 'bundle block');

		expect(searchResult.rows[0]).toMatchObject({
			blockName: 'Bundle Block',
			internalName: 'Bundle_Block_Internal',
			sourceKind: 'bundle',
			spawnCommand: 'SpawnBlock Bundle_Block(Bundle_Blocks)'
		});
	});

	it('keeps bundle extraction as TextAsset payloads before Nuterra parsing', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-text-assets-');
		const bundlePath = path.join(tempDir, 'BundleBlocks_bundle');
		fs.writeFileSync(bundlePath, 'UnityFS\0{"m_Name":"Bundle_Block_Internal","Type":"NuterraBlock","Name":"Bundle Block","ID":77}', 'utf8');
		const stats = fs.statSync(bundlePath);

		const textAssetsBySource = await extractBundleTextAssets([bundlePath], {
			allowEmbeddedFallback: true,
			extractorPath: null
		});
		const textAssets = textAssetsBySource.get(bundlePath) ?? [];
		const records = createBlockLookupRecordsFromTextAssets(
			{
				modTitle: 'Bundle Blocks',
				mtimeMs: stats.mtimeMs,
				size: stats.size,
				sourceKind: 'bundle',
				sourcePath: bundlePath,
				workshopId: '24680'
			},
			textAssets
		);

		expect(textAssets).toEqual([
			expect.objectContaining({
				assetName: 'BundleBlocks_bundle',
				text: expect.stringContaining('NuterraBlock')
			})
		]);
		expect(records[0]).toMatchObject({
			blockName: 'Bundle Block',
			internalName: 'Bundle_Block_Internal',
			spawnCommand: 'SpawnBlock Bundle_Block(Bundle_Blocks)'
		});
	});

	it('reads native sidecar TextAsset JSON output by source path', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-sidecar-contract-');
		const firstBundlePath = path.join(tempDir, 'FirstBundle_bundle');
		const secondBundlePath = path.join(tempDir, 'SecondBundle_bundle');
		const stdout = JSON.stringify({
			version: 1,
			files: [
				{
					sourcePath: firstBundlePath,
					textAssets: [
						{
							assetName: 'FirstBundle',
							text: '{"Type":"NuterraBlock","Name":"First Bundle Block","ID":21}'
						}
					]
				},
				{
					sourcePath: secondBundlePath,
					textAssets: [],
					errors: ['No TextAssets contained NuterraBlock data']
				}
			]
		});
		const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((_file, _args, _options, callback) => {
			if (typeof callback === 'function') {
				callback(null, stdout, 'sidecar warning');
			}
			return {} as childProcess.ChildProcess;
		}) as typeof childProcess.execFile);

		const textAssetsBySource = await extractBundleTextAssets([firstBundlePath, secondBundlePath], {
			allowEmbeddedFallback: false,
			extractorPath: '/fake/block-lookup-extractor'
		});

		expect(execFileSpy).toHaveBeenCalledWith(
			'/fake/block-lookup-extractor',
			[firstBundlePath, secondBundlePath],
			expect.objectContaining({
				encoding: 'utf8',
				windowsHide: true
			}),
			expect.any(Function)
		);
		expect(textAssetsBySource.get(firstBundlePath)).toEqual([
			{
				assetName: 'FirstBundle',
				text: '{"Type":"NuterraBlock","Name":"First Bundle Block","ID":21}'
			}
		]);
		expect(textAssetsBySource.get(secondBundlePath)).toEqual([]);
	});

	it('normalizes native sidecar TextAsset extraction outcomes by source path', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-sidecar-outcomes-');
		const assetBundlePath = path.join(tempDir, 'AssetBundle_bundle');
		const emptyBundlePath = path.join(tempDir, 'EmptyBundle_bundle');
		const failedBundlePath = path.join(tempDir, 'FailedBundle_bundle');
		const stdout = JSON.stringify({
			version: 1,
			files: [
				{
					sourcePath: assetBundlePath,
					textAssets: [
						{
							assetName: 'AssetBundle',
							text: '{"Type":"NuterraBlock","Name":"Asset Bundle Block","ID":21}'
						}
					]
				},
				{
					sourcePath: emptyBundlePath,
					textAssets: []
				},
				{
					sourcePath: failedBundlePath,
					textAssets: [],
					errors: ['Unable to read bundle TextAssets']
				}
			]
		});
		vi.spyOn(childProcess, 'execFile').mockImplementation(((_file, _args, _options, callback) => {
			if (typeof callback === 'function') {
				callback(null, stdout, '');
			}
			return {} as childProcess.ChildProcess;
		}) as typeof childProcess.execFile);

		const outcomes = await extractBundleTextAssetOutcomes([assetBundlePath, emptyBundlePath, failedBundlePath], {
			allowEmbeddedFallback: false,
			extractorPath: '/fake/block-lookup-extractor'
		});

		expect(outcomes.get(assetBundlePath)).toEqual({
			issues: [],
			sourcePath: assetBundlePath,
			status: 'success',
			textAssets: [
				{
					assetName: 'AssetBundle',
					text: '{"Type":"NuterraBlock","Name":"Asset Bundle Block","ID":21}'
				}
			]
		});
		expect(outcomes.get(emptyBundlePath)).toEqual({
			issues: [],
			sourcePath: emptyBundlePath,
			status: 'success',
			textAssets: []
		});
		expect(outcomes.get(failedBundlePath)).toEqual({
			issues: ['Unable to read bundle TextAssets'],
			sourcePath: failedBundlePath,
			status: 'issue',
			textAssets: []
		});
	});

	it('skips embedded bundle fallback when the source exceeds the configured size limit', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-fallback-limit-');
		const bundlePath = path.join(tempDir, 'BundleBlocks_bundle');
		fs.writeFileSync(bundlePath, 'UnityFS\0{"Type":"NuterraBlock","Name":"Bundle Block","ID":77}', 'utf8');

		const textAssetsBySource = await extractBundleTextAssets([bundlePath], {
			allowEmbeddedFallback: true,
			extractorPath: null,
			maxEmbeddedFallbackBytes: 8
		});

		expect(textAssetsBySource.get(bundlePath)).toEqual([]);
	});

	it('requires the sidecar when embedded bundle fallback is disabled', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-required-sidecar-');
		const bundlePath = path.join(tempDir, 'BundleBlocks_bundle');
		fs.writeFileSync(bundlePath, '{"Type":"NuterraBlock","Name":"Bundle Block","ID":77}', 'utf8');

		await expect(
			extractBundleTextAssets([bundlePath], {
				allowEmbeddedFallback: false,
				extractorPath: null
			})
		).rejects.toThrow('Block Lookup native extractor is unavailable');
	});
});

describe('block lookup indexer facade', () => {
	it('owns build, persisted JSON shape, stats, and search behind one main-process interface', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-module-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const blockJsonPath = path.join(blockJsonDir, 'TestCannon.json');
		fs.mkdirSync(blockJsonDir, { recursive: true });
		fs.writeFileSync(
			blockJsonPath,
			JSON.stringify({
				Type: 'NuterraBlock',
				Name: 'Alpha Cannon',
				ID: 42
			}),
			'utf8'
		);

		const indexModule = createBlockLookupIndexModule(userDataPath);
		const buildResult = await indexModule.buildIndex({
			workshopRoot,
			modSources: [
				{
					uid: 'workshop:12345',
					name: 'Test Blocks',
					path: modDir,
					workshopID: '12345'
				}
			]
		});

		expect(buildResult.settings).toEqual({ workshopRoot });
		expect(buildResult.stats).toEqual({
			sources: 1,
			scanned: 1,
			skipped: 0,
			removed: 0,
			blocks: 1,
			updatedBlocks: 1,
			builtAt: expect.any(String)
		});
		expect(indexModule.readSettings()).toEqual({ workshopRoot });
		expect(indexModule.getStats()).toEqual({
			sources: 1,
			scanned: 0,
			skipped: 0,
			removed: 0,
			blocks: 1,
			updatedBlocks: 0,
			builtAt: buildResult.stats.builtAt
		});
		expect(indexModule.search({ query: 'alpha cannon', limit: 5 })).toMatchObject({
			rows: [
				{
					blockName: 'Alpha Cannon',
					internalName: 'TestCannon',
					modTitle: 'Test Blocks',
					sourceKind: 'json',
					sourcePath: path.normalize(blockJsonPath),
					spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
				}
			],
			stats: {
				blocks: 1,
				builtAt: buildResult.stats.builtAt
			}
		});

		const persistedIndex = JSON.parse(fs.readFileSync(path.join(userDataPath, 'block-lookup-index.json'), 'utf8'));
		expect(persistedIndex).toEqual({
			version: 1,
			builtAt: buildResult.stats.builtAt,
			sources: [
				{
					sourcePath: path.normalize(blockJsonPath),
					workshopId: '12345',
					modTitle: 'Test Blocks',
					sourceKind: 'json',
					size: expect.any(Number),
					mtimeMs: expect.any(Number)
				}
			],
			records: [
				{
					blockName: 'Alpha Cannon',
					internalName: 'TestCannon',
					blockId: '42',
					modTitle: 'Test Blocks',
					workshopId: '12345',
					sourceKind: 'json',
					sourcePath: path.normalize(blockJsonPath),
					preferredAlias: 'Alpha_Cannon(Test_Blocks)',
					fallbackAlias: 'Alpha_Cannon(Test_Blocks)',
					spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)',
					fallbackSpawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
				}
			]
		});
	});

	it('auto-detects workshop roots through the main-process interface', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-autodetect-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		fs.mkdirSync(modDir, { recursive: true });

		const indexModule = createBlockLookupIndexModule(userDataPath);
		vi.mocked(Steamworks.ugcGetItemInstallInfo).mockReturnValue({
			folder: modDir,
			sizeOnDisk: '1',
			timestamp: 0
		});

		expect(
			indexModule.autoDetectWorkshopRoot({
				modSources: [
					{
						uid: 'workshop:12345',
						workshopID: '12345'
					}
				]
			})
		).toBe(path.normalize(workshopRoot));
	});

	it('auto-detects workshop roots through subscribed Steamworks items', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-subscribed-autodetect-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '222');
		fs.mkdirSync(modDir, { recursive: true });
		vi.mocked(Steamworks.getSubscribedItems).mockReturnValue([BigInt(222)]);
		vi.mocked(Steamworks.ugcGetItemInstallInfo).mockReturnValue({
			folder: modDir,
			sizeOnDisk: '1',
			timestamp: 0
		});

		const indexModule = createBlockLookupIndexModule(userDataPath);

		expect(indexModule.autoDetectWorkshopRoot({ modSources: [] })).toBe(path.normalize(workshopRoot));
	});

	it('keeps configured workshop roots ahead of Steamworks autodetection', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-configured-root-');
		const userDataPath = path.join(tempDir, 'user-data');
		const configuredRoot = path.join(tempDir, 'ConfiguredLibrary', 'steamapps', 'workshop', 'content', '285920');
		const detectedRoot = path.join(tempDir, 'DetectedLibrary', 'steamapps', 'workshop', 'content', '285920');
		fs.mkdirSync(path.join(configuredRoot, '111'), { recursive: true });
		fs.mkdirSync(path.join(detectedRoot, '222'), { recursive: true });
		vi.mocked(Steamworks.getSubscribedItems).mockReturnValue([BigInt(222)]);
		vi.mocked(Steamworks.ugcGetItemInstallInfo).mockReturnValue({
			folder: path.join(detectedRoot, '222'),
			sizeOnDisk: '1',
			timestamp: 0
		});

		const indexModule = createBlockLookupIndexModule(userDataPath);

		expect(indexModule.autoDetectWorkshopRoot({ workshopRoot: configuredRoot })).toBe(path.normalize(configuredRoot));
		expect(collectBlockLookupSources({ workshopRoot: configuredRoot, modSources: [], forceRebuild: true }).workshopRoot).toBe(
			path.normalize(configuredRoot)
		);
	});

	it('falls back to configured workshop roots when Steamworks autodetection throws', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-steamworks-throws-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		fs.mkdirSync(path.join(workshopRoot, '12345'), { recursive: true });
		vi.mocked(Steamworks.ugcGetItemInstallInfo).mockImplementation(() => {
			throw new Error('Steamworks unavailable');
		});
		vi.mocked(Steamworks.getSubscribedItems).mockImplementation(() => {
			throw new Error('Steamworks unavailable');
		});
		vi.mocked(Steamworks.getAppInstallDir).mockImplementation(() => {
			throw new Error('Steamworks unavailable');
		});

		const indexModule = createBlockLookupIndexModule(userDataPath);
		expect(indexModule.autoDetectWorkshopRoot({ modSources: [{ uid: 'workshop:12345', workshopID: '12345' }] })).toBeNull();
		expect(
			collectBlockLookupSources({
				workshopRoot,
				modSources: [{ uid: 'workshop:12345', workshopID: '12345' }],
				forceRebuild: true
			}).workshopRoot
		).toBe(path.normalize(workshopRoot));
	});

	it('falls back to loaded workshop mod paths when Steamworks install info is unavailable', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-mod-path-fallback-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		fs.mkdirSync(modDir, { recursive: true });
		vi.mocked(Steamworks.ugcGetItemInstallInfo).mockReturnValue(undefined);

		const indexModule = createBlockLookupIndexModule(userDataPath);

		expect(
			indexModule.autoDetectWorkshopRoot({
				modSources: [
					{
						uid: 'workshop:12345',
						path: modDir,
						workshopID: '12345'
					}
				]
			})
		).toBe(path.normalize(workshopRoot));
	});

	it('auto-detects loaded workshop mod paths without workshop ids', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-mod-path-only-');
		const userDataPath = path.join(tempDir, 'user-data');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '12345');
		fs.mkdirSync(modDir, { recursive: true });

		const indexModule = createBlockLookupIndexModule(userDataPath);

		expect(
			indexModule.autoDetectWorkshopRoot({
				modSources: [
					{
						uid: 'local-reference',
						path: modDir
					}
				]
			})
		).toBe(path.normalize(workshopRoot));
	});

	it('uses autodetection before stale configured workshop roots while collecting sources', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-stale-root-');
		const detectedRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const staleRoot = path.join(tempDir, 'MissingLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(detectedRoot, '12345');
		fs.mkdirSync(modDir, { recursive: true });

		expect(
			collectBlockLookupSources({
				workshopRoot: staleRoot,
				modSources: [{ uid: 'loaded-workshop-mod', path: modDir }],
				forceRebuild: true
			}).workshopRoot
		).toBe(path.normalize(detectedRoot));
	});

	it('falls back to deriving workshop roots from the TerraTech executable path', () => {
		const tempDir = createTempDir('ttsmm-block-lookup-game-exec-root-');
		const userDataPath = path.join(tempDir, 'user-data');
		const gameRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'common', 'TerraTech');
		const gameExec = path.join(gameRoot, 'TerraTechWin64.exe');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		fs.mkdirSync(path.join(gameRoot, 'TerraTechWin64_Data', 'Managed'), { recursive: true });
		fs.writeFileSync(path.join(gameRoot, 'TerraTechWin64_Data', 'Managed', 'Assembly-CSharp.dll'), '');
		fs.writeFileSync(gameExec, '');
		fs.mkdirSync(path.join(workshopRoot, '12345'), { recursive: true });
		vi.mocked(Steamworks.getSubscribedItems).mockReturnValue([]);
		vi.mocked(Steamworks.getAppInstallDir).mockReturnValue('');

		const indexModule = createBlockLookupIndexModule(userDataPath);

		expect(indexModule.autoDetectWorkshopRoot({ gameExec, modSources: [] })).toBe(path.normalize(workshopRoot));
	});

	it('delegates settings, stats, and search to one user data boundary', () => {
		const userDataPath = createTempDir('ttsmm-block-lookup-indexer-');
		const indexer = createBlockLookupIndexModule(userDataPath);
		const workshopRoot = path.normalize('C:/Steam/workshop/content/285920');

		expect(indexer.readSettings()).toEqual({ workshopRoot: '' });
		expect(indexer.saveSettings({ workshopRoot: '  C:/Steam/workshop/content/285920  ' })).toEqual({
			workshopRoot
		});
		expect(indexer.readSettings()).toEqual({ workshopRoot });
		expect(indexer.getStats()).toBeNull();
		expect(indexer.search({ query: '', limit: 10 })).toEqual({
			rows: [],
			stats: null
		});
	});

	it('reuses a warm parsed search index across repeated queries and refreshes after rebuilds', async () => {
		const userDataPath = createTempDir('ttsmm-block-lookup-warm-indexer-');
		const indexPath = path.join(userDataPath, 'block-lookup-index.json');
		fs.mkdirSync(userDataPath, { recursive: true });
		fs.writeFileSync(
			indexPath,
			JSON.stringify(
				{
					version: 1,
					builtAt: '2026-04-26T00:00:00.000Z',
					sources: [],
					records: [
						{
							blockId: '42',
							blockName: 'Alpha Cannon',
							fallbackAlias: 'Alpha_Cannon(Test_Blocks)',
							fallbackSpawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)',
							internalName: 'TestCannon',
							modTitle: 'Test Blocks',
							preferredAlias: 'Alpha_Cannon(Test_Blocks)',
							sourceKind: 'json',
							sourcePath: path.normalize('/mods/TestCannon.json'),
							spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)',
							workshopId: '12345'
						}
					]
				},
				null,
				2
			),
			'utf8'
		);
		let readCount = 0;
		const indexer = createBlockLookupIndexModule(userDataPath, {
			readBlockLookupIndex: (pathToRead) => {
				readCount += 1;
				return JSON.parse(fs.readFileSync(path.join(pathToRead, 'block-lookup-index.json'), 'utf8'));
			},
			buildBlockLookupIndex: async () => {
				fs.writeFileSync(
					indexPath,
					JSON.stringify({ version: 1, builtAt: '2026-04-26T01:00:00.000Z', sources: [], records: [] }, null, 2),
					'utf8'
				);
				return {
					settings: { workshopRoot: '' },
					stats: {
						sources: 0,
						scanned: 0,
						skipped: 0,
						removed: 0,
						blocks: 0,
						updatedBlocks: 0,
						builtAt: '2026-04-26T01:00:00.000Z'
					}
				};
			}
		});

		expect(indexer.search({ query: 'alpha', limit: 10 }).rows).toHaveLength(1);
		expect(indexer.search({ query: 'cannon', limit: 10 }).rows).toHaveLength(1);
		expect(readCount).toBe(1);

		await indexer.buildIndex({ workshopRoot: path.join(userDataPath, 'missing-workshop-root'), modSources: [], forceRebuild: true });

		expect(indexer.search({ query: 'alpha', limit: 10 })).toMatchObject({
			rows: [],
			stats: expect.objectContaining({ blocks: 0 })
		});
		expect(readCount).toBe(2);
	});
});

describe('block lookup index planner', () => {
	it('marks unchanged sources for reuse and counts removed sources', () => {
		const existingSource = {
			sourcePath: path.normalize('/mods/a/Block.json'),
			sourceKind: 'json' as const,
			workshopId: 'a',
			modTitle: 'A',
			size: 10,
			mtimeMs: 20
		};
		const plan = createBlockLookupIndexPlan(
			{
				version: 1,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: [
					existingSource,
					{
						sourcePath: path.normalize('/mods/removed/Block.json'),
						sourceKind: 'json' as const,
						workshopId: 'removed',
						modTitle: 'Removed',
						size: 1,
						mtimeMs: 1
					}
				],
				records: [
					{
						blockId: '1',
						blockName: 'Cab',
						fallbackAlias: 'Cab(A)',
						fallbackSpawnCommand: 'SpawnBlock Cab(A)',
						internalName: 'Cab',
						modTitle: 'A',
						preferredAlias: 'Cab(A)',
						sourceKind: 'json',
						sourcePath: existingSource.sourcePath,
						spawnCommand: 'SpawnBlock Cab(A)',
						workshopId: 'a'
					}
				]
			},
			[existingSource]
		);

		expect(plan.removed).toBe(1);
		expect(plan.tasks).toEqual([
			expect.objectContaining({
				existingSource,
				reusedRecords: [expect.objectContaining({ blockName: 'Cab' })],
				source: existingSource
			})
		]);
	});
});

describe('block lookup search adapter', () => {
	it('ranks exact block names before exact internal names and deprecated matches', () => {
		const createRecord = (blockName: string, internalName: string) => ({
			blockId: '',
			blockName,
			fallbackAlias: `${blockName}(Core)`,
			fallbackSpawnCommand: `SpawnBlock ${blockName}(Core)`,
			internalName,
			modTitle: 'Core',
			preferredAlias: `${blockName}(Core)`,
			sourceKind: 'json' as const,
			sourcePath: path.normalize(`/mods/${internalName}.json`),
			spawnCommand: `SpawnBlock ${blockName}(Core)`,
			workshopId: 'core'
		});

		const result = searchBlockLookupRecords(
			{
				version: 1,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: [],
				records: [createRecord('Other Match', 'Cab'), createRecord('Deprecated Cab', '_deprecated_cab'), createRecord('Cab', 'ExactCab')]
			},
			'Cab'
		);

		expect(result.rows.map((record: BlockLookupRecord) => record.blockName)).toEqual(['Cab', 'Other Match', 'Deprecated Cab']);
	});

	it('keeps limit handling, empty index behavior, and stats behavior stable', () => {
		const createRecord = (blockName: string) => ({
			blockId: blockName,
			blockName,
			fallbackAlias: `${blockName}(Core)`,
			fallbackSpawnCommand: `SpawnBlock ${blockName}(Core)`,
			internalName: blockName,
			modTitle: 'Core',
			preferredAlias: `${blockName}(Core)`,
			sourceKind: 'json' as const,
			sourcePath: path.normalize(`/mods/${blockName}.json`),
			spawnCommand: `SpawnBlock ${blockName}(Core)`,
			workshopId: 'core'
		});

		expect(searchBlockLookupRecords({ version: 1, builtAt: '', sources: [], records: [] }, '', 10)).toEqual({
			rows: [],
			stats: null
		});

		const result = searchBlockLookupRecords(
			{
				version: 1,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: [],
				records: [createRecord('Alpha'), createRecord('Beta'), createRecord('Gamma')]
			},
			'',
			2
		);

		expect(result.rows.map((record: BlockLookupRecord) => record.blockName)).toEqual(['Alpha', 'Beta']);
		expect(result.stats).toMatchObject({
			blocks: 3,
			sources: 0,
			builtAt: '2026-04-26T00:00:00.000Z'
		});
	});

	it('normalizes malformed persisted index records before warming search', () => {
		const userDataPath = createTempDir('ttsmm-block-lookup-malformed-index-');
		fs.mkdirSync(userDataPath, { recursive: true });
		fs.writeFileSync(
			path.join(userDataPath, 'block-lookup-index.json'),
			JSON.stringify({
				version: 1,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: [
					{
						sourcePath: path.normalize('/mods/valid.json'),
						workshopId: 'core',
						modTitle: 'Core',
						sourceKind: 'json',
						size: 10,
						mtimeMs: 20
					},
					{
						sourcePath: path.normalize('/mods/bad.json'),
						workshopId: 'core',
						modTitle: 'Core',
						sourceKind: 'invalid',
						size: 10,
						mtimeMs: 20
					}
				],
				records: [
					{
						blockId: '1',
						blockName: 'Cab',
						fallbackAlias: 'Cab(Core)',
						fallbackSpawnCommand: 'SpawnBlock Cab(Core)',
						internalName: 'Cab',
						modTitle: 'Core',
						preferredAlias: 'Cab(Core)',
						sourceKind: 'json',
						sourcePath: path.normalize('/mods/valid.json'),
						spawnCommand: 'SpawnBlock Cab(Core)',
						workshopId: 'core'
					},
					{
						blockId: 2,
						blockName: 'Bad Cab',
						internalName: 'BadCab',
						modTitle: 'Core',
						sourceKind: 'json'
					}
				]
			}),
			'utf8'
		);

		const index = readBlockLookupIndex(userDataPath);
		expect(index.sources).toHaveLength(1);
		expect(index.records).toHaveLength(1);
		expect(searchBlockLookupIndex(userDataPath, 'cab')).toEqual({
			rows: [expect.objectContaining({ blockName: 'Cab' })],
			stats: expect.objectContaining({
				blocks: 1,
				sources: 1
			})
		});
	});

	it('treats invalid persisted index versions and container shapes as empty indexes', () => {
		const userDataPath = createTempDir('ttsmm-block-lookup-invalid-index-');
		fs.mkdirSync(userDataPath, { recursive: true });
		fs.writeFileSync(
			path.join(userDataPath, 'block-lookup-index.json'),
			JSON.stringify({
				version: 999,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: {},
				records: {}
			}),
			'utf8'
		);

		expect(readBlockLookupIndex(userDataPath)).toEqual({
			version: 1,
			builtAt: '',
			sources: [],
			records: []
		});
		expect(searchBlockLookupIndex(userDataPath, 'cab')).toEqual({
			rows: [],
			stats: null
		});
	});
});

describe('block lookup ipc handlers', () => {
	it('rejects malformed settings payloads before writing settings', async () => {
		const { invoke, userDataPath } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SAVE_SETTINGS, { workshopRoot: 42 })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-save-settings'
		);

		expect(fs.existsSync(path.join(userDataPath, 'block-lookup-settings.json'))).toBe(false);
	});

	it('rejects malformed build request payloads', async () => {
		const { invoke } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_BUILD_INDEX, { modSources: 'not-an-array' })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-build-index'
		);
		await expect(invoke(ValidChannel.BLOCK_LOOKUP_AUTODETECT_WORKSHOP_ROOT, { forceRebuild: 'yes' })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-autodetect-workshop-root'
		);
	});

	it('rejects malformed search payloads before reading the index', async () => {
		const { invoke } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, { limit: 10 })).rejects.toThrow('Invalid IPC payload for block-lookup-search');
		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, { query: '', limit: 1001 })).rejects.toThrow(
			'Invalid IPC payload for block-lookup-search'
		);
	});

	it('accepts valid search payloads', async () => {
		const { invoke } = createBlockLookupHandlerHarness();

		await expect(invoke(ValidChannel.BLOCK_LOOKUP_SEARCH, { query: '', limit: 10 })).resolves.toEqual({
			rows: [],
			stats: null
		});
	});
});
