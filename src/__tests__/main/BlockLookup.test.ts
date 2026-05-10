import fs from 'fs';
import path from 'path';
import childProcess from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildBlockLookupAliases,
	buildBlockLookupIndex,
	extractNuterraBlocksFromText,
	searchBlockLookupIndex
} from '../../main/block-lookup';
import { extractBundleTextAssetOutcomes, extractBundleTextAssets } from '../../main/block-lookup-bundle-text-assets';
import { createBlockLookupBundleSourceExtractionAdapter } from '../../main/block-lookup-extraction';
import { createBlockLookupIndexBuild } from '../../main/block-lookup-index-build';
import { createBlockLookupRecordsFromTextAssets } from '../../main/block-lookup-nuterra-text';
import {
	MAX_BLOCK_LOOKUP_JSON_DEPTH,
	collectBlockLookupSources,
	type BlockLookupSourceRecord
} from '../../main/block-lookup-source-discovery';
import { indexBlockLookupSources } from '../../main/block-lookup-source-indexing';
import Steamworks from '../../main/steamworks';
import { BLOCK_LOOKUP_INDEX_VERSION, type BlockLookupRecord } from '../../shared/block-lookup';
import { createTempDir } from './test-utils';

beforeEach(() => {
	vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
	vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
	vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
});

afterEach(() => {
	delete process.env.TTSMM_BLOCK_LOOKUP_EXTRACTOR_PATH;
	vi.restoreAllMocks();
});

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
		previewBounds: overrides.previewBounds,
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
			'{"m_Name":"HE_Flak","Type":"NuterraBlock","Name":"Hawkeye Quad 20mm ORION","ID":10005,"BlockExtents":{"x":2,"y":1,"z":3}}',
			'fallback'
		);

		expect(blocks).toEqual([
			{
				blockName: 'Hawkeye Quad 20mm ORION',
				blockId: '10005',
				internalName: 'HE_Flak',
				previewBounds: { x: 2, y: 1, z: 3 }
			}
		]);
	});

	it('extracts Nuterra JSON blocks that rely on the asset name for SpawnBlock aliasing', () => {
		const blocks = extractNuterraBlocksFromText(
			'{"NuterraBlock":{"GamePrefabReference":"GSO_Shop_121","BlockExtents":{"x":3,"y":6,"z":3}}}',
			'GSO-FSI Omni terminal'
		);

		expect(blocks).toEqual([
			{
				blockName: 'GSO-FSI Omni terminal',
				blockId: '',
				internalName: 'GSO-FSI Omni terminal',
				previewBounds: { x: 3, y: 6, z: 3 }
			}
		]);
	});

	it('does not fallback-index non-block assets that only mention NuterraBlock', () => {
		expect(extractNuterraBlocksFromText('{"Notes":"This text mentions NuterraBlock without defining one."}', 'Readme')).toEqual([]);
		expect(
			extractNuterraBlocksFromText('{"Notes":"NuterraBlock example with BlockExtents","BlockExtents":{"x":1,"y":1,"z":1}}', 'Readme')
		).toEqual([]);
		expect(extractNuterraBlocksFromText('{"Notes":"NuterraBlock example","GamePrefabReference":"Foo"}', 'Readme')).toEqual([]);
	});

	it('indexes JSON block sources through the Block Lookup source indexing interface', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-json-');
		const jsonPath = path.join(tempDir, 'TestCannon.json');
		fs.writeFileSync(jsonPath, '{"Type":"NuterraBlock","Name":"Alpha Cannon","ID":42,"BlockExtents":{"x":2,"y":1,"z":3}}', 'utf8');
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
				previewBounds: { x: 2, y: 1, z: 3 },
				sourceKind: 'json',
				spawnCommand: 'SpawnBlock Alpha_Cannon(Test_Blocks)'
			})
		]);
	});

	it('indexes BlockJSON blocks without names using the file name alias', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-json-nameless-');
		const jsonPath = path.join(tempDir, 'GSO-FSI Omni terminal.json');
		fs.writeFileSync(jsonPath, '{"NuterraBlock":{"GamePrefabReference":"GSO_Shop_121","BlockExtents":{"x":3,"y":6,"z":3}}}', 'utf8');
		const stats = fs.statSync(jsonPath);

		const result = await indexBlockLookupSources([
			{
				modTitle: 'Flaggship Industries',
				mtimeMs: stats.mtimeMs,
				size: stats.size,
				sourceKind: 'json',
				sourcePath: jsonPath,
				workshopId: '3429943957'
			}
		]);

		expect(result.recordsBySourcePath.get(jsonPath)).toEqual([
			expect.objectContaining({
				blockName: 'GSO-FSI Omni terminal',
				internalName: 'GSO-FSI Omni terminal',
				previewBounds: { x: 3, y: 6, z: 3 },
				spawnCommand: 'SpawnBlock GSO_FSI_Omni_terminal(Flaggship_Industries)'
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

		expect([...result.recordsBySourcePath.values()].flat()).toEqual([
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
		expect(result.recordsBySourcePath.get(bundleSource.sourcePath)?.map((record) => record.blockName)).toEqual(['Bundle Routed bundle']);
		expect(result.recordsBySourcePath.get(jsonSource.sourcePath)?.map((record) => record.blockName)).toEqual(['JSON Routed json']);
		expect(result.recordsBySourcePath.get(secondBundleSource.sourcePath)?.map((record) => record.blockName)).toEqual([
			'Bundle Routed second-bundle'
		]);
		expect(result.recordsBySourcePath.get(vanillaSource.sourcePath)?.map((record) => record.blockName)).toEqual(['Vanilla Routed vanilla']);
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
		expect([...result.recordsBySourcePath.values()].flat()).toEqual([
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
		expect([...result.recordsBySourcePath.values()].flat()).toHaveLength(3);
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
		expect([...result.recordsBySourcePath.values()].flat()).toEqual([expect.objectContaining({ blockName: 'Good Bundle Block' })]);
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
						previewAssets: [],
						sourcePath: emptyBundlePath,
						status: 'success' as const,
						textAssets: []
					}
				],
				[
					failedBundlePath,
					{
						issues: ['Unable to read bundle TextAssets'],
						previewAssets: [],
						sourcePath: failedBundlePath,
						status: 'issue' as const,
						textAssets: []
					}
				],
				[
					goodBundlePath,
					{
						issues: [],
						previewAssets: [],
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

	it('writes extracted bundle preview assets to the rendered preview cache', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-source-bundle-previews-');
		const previewCacheDir = path.join(tempDir, 'user-data', 'block-lookup-rendered-previews');
		const cacheRelativePath = 'bundle/synthetic-preview.png';
		const bundlePath = path.join(tempDir, 'GoodBundle_bundle');
		fs.writeFileSync(bundlePath, 'good bundle', 'utf8');
		fs.mkdirSync(path.join(previewCacheDir, 'bundle'), { recursive: true });
		fs.writeFileSync(path.join(previewCacheDir, cacheRelativePath), 'synthetic png bytes');
		const stats = fs.statSync(bundlePath);
		const extractBundleTextAssetOutcomesAdapter = vi.fn(async () => {
			return new Map([
				[
					bundlePath,
					{
						issues: [],
						previewAssets: [
							{
								assetName: 'Good_Bundle_Internal_icon',
								cacheRelativePath,
								height: 2,
								width: 3
							}
						],
						sourcePath: bundlePath,
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
					modTitle: 'Good Bundle',
					mtimeMs: stats.mtimeMs,
					size: stats.size,
					sourceKind: 'bundle',
					sourcePath: bundlePath,
					workshopId: 'good'
				}
			],
			{
				sourceExtractionAdapters: {
					bundle: createBlockLookupBundleSourceExtractionAdapter({
						extractBundleTextAssetOutcomes: extractBundleTextAssetOutcomesAdapter
					})
				}
			},
			{ previewCacheDir, renderedPreviewsEnabled: true }
		);

		const [record] = result.recordsBySourcePath.get(bundlePath) ?? [];
		expect(record.renderedPreview).toMatchObject({
			height: 2,
			imageUrl: expect.stringMatching(/^image:\/\/block-preview\/bundle\//),
			width: 3
		});
		const renderedCacheRelativePath = decodeURIComponent(new URL(record.renderedPreview!.imageUrl).pathname.replace(/^\/+/, ''));
		expect(fs.existsSync(path.join(previewCacheDir, renderedCacheRelativePath))).toBe(true);
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
				ID: 42,
				BlockExtents: { x: 2, y: 1, z: 3 }
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

		expect(firstBuild.stats.blocks).toBe(1);
		expect(firstBuild.stats.scanned).toBe(1);

		const searchResult = searchBlockLookupIndex(userDataPath, 'alpha cannon');
		expect(searchResult.rows).toHaveLength(1);
		expect(searchResult.rows[0]).toMatchObject({
			blockName: 'Alpha Cannon',
			internalName: 'TestCannon',
			modTitle: 'Test Blocks',
			previewBounds: { x: 2, y: 1, z: 3 },
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
			version: BLOCK_LOOKUP_INDEX_VERSION,
			builtAt: '',
			renderedPreviewsEnabled: false,
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

		expect(firstBuild.workshopRoot).toEqual(workshopRoot);
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

	it('dedupes the same mod block when it is present in both bundle and JSON sources', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-dedupe-');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '3429943957');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const bundlePath = path.join(modDir, 'A_Flaggship_Industries_bundle');
		const jsonPath = path.join(blockJsonDir, 'GSO-FSI Omni terminal.json');
		fs.mkdirSync(blockJsonDir, { recursive: true });
		fs.writeFileSync(bundlePath, 'bundle', 'utf8');
		fs.writeFileSync(jsonPath, '{"NuterraBlock":{"GamePrefabReference":"GSO_Shop_121"}}', 'utf8');

		const emptyIndex = {
			version: BLOCK_LOOKUP_INDEX_VERSION,
			builtAt: '',
			renderedPreviewsEnabled: false,
			sources: [],
			records: []
		} as const;

		const build = await createBlockLookupIndexBuild(
			emptyIndex,
			{
				workshopRoot,
				modSources: [
					{
						uid: 'workshop:3429943957',
						name: 'Flaggship Industries',
						path: modDir,
						workshopID: '3429943957'
					}
				]
			},
			{
				indexBlockLookupSources: async (sources) => {
					const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
					for (const source of sources) {
						recordsBySourcePath.set(source.sourcePath, [
							createTestBlockLookupRecord({
								blockId: source.sourceKind === 'json' ? '121' : '',
								blockName: 'GSO-FSI Omni terminal',
								internalName: 'GSO-FSI Omni terminal',
								modTitle: 'Flaggship Industries',
								previewBounds: source.sourceKind === 'bundle' ? { x: 3, y: 6, z: 3 } : undefined,
								sourceKind: source.sourceKind,
								sourcePath: source.sourcePath,
								workshopId: '3429943957'
							})
						]);
					}
					return { recordsBySourcePath };
				}
			}
		);

		expect(build.index.records).toHaveLength(1);
		expect(build.index.sourceRecords).toHaveLength(2);
		expect(build.index.records[0]).toMatchObject({
			blockId: '121',
			blockName: 'GSO-FSI Omni terminal',
			previewBounds: { x: 3, y: 6, z: 3 },
			sourceKind: 'json',
			sourcePath: path.normalize(jsonPath)
		});
		expect(build.stats).toMatchObject({
			blocks: 1,
			updatedBlocks: 1
		});

		fs.rmSync(jsonPath);
		const rebuildWithoutJson = await createBlockLookupIndexBuild(
			build.index,
			{
				workshopRoot,
				modSources: [
					{
						uid: 'workshop:3429943957',
						name: 'Flaggship Industries',
						path: modDir,
						workshopID: '3429943957'
					}
				]
			},
			{
				indexBlockLookupSources: async () => {
					throw new Error('unchanged bundle source should reuse sourceRecords');
				}
			}
		);

		expect(rebuildWithoutJson.index.records).toHaveLength(1);
		expect(rebuildWithoutJson.index.records[0]).toMatchObject({
			blockName: 'GSO-FSI Omni terminal',
			sourceKind: 'bundle',
			sourcePath: path.normalize(bundlePath)
		});
		expect(rebuildWithoutJson.stats).toMatchObject({
			removed: 1,
			scanned: 0,
			skipped: 1
		});
	});

	it('persists rendered preview support on indexes built with the opt-in flag', async () => {
		const build = await createBlockLookupIndexBuild(
			{ version: BLOCK_LOOKUP_INDEX_VERSION, builtAt: '', renderedPreviewsEnabled: false, sources: [], records: [] },
			{
				modSources: [],
				renderedPreviewsEnabled: true
			}
		);

		expect(build.index.renderedPreviewsEnabled).toBe(true);
		expect(build.stats.renderedPreviewsEnabled).toBe(true);
		expect(build.stats.renderedPreviews).toBe(0);
		expect(build.stats.unavailablePreviews).toBe(0);
	});

	it('keeps ID-bearing block lookup records over ID-less source duplicates', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-dedupe-id-');
		const workshopRoot = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920');
		const modDir = path.join(workshopRoot, '3429943957');
		const blockJsonDir = path.join(modDir, 'BlockJSON');
		const bundlePath = path.join(modDir, 'A_Flaggship_Industries_bundle');
		const jsonPath = path.join(blockJsonDir, 'GSO-FSI Omni terminal.json');
		fs.mkdirSync(blockJsonDir, { recursive: true });
		fs.writeFileSync(bundlePath, 'bundle', 'utf8');
		fs.writeFileSync(jsonPath, '{"NuterraBlock":{"GamePrefabReference":"GSO_Shop_121"}}', 'utf8');

		const build = await createBlockLookupIndexBuild(
			{
				version: BLOCK_LOOKUP_INDEX_VERSION,
				builtAt: '',
				renderedPreviewsEnabled: false,
				sources: [],
				records: []
			},
			{
				workshopRoot,
				modSources: [
					{
						uid: 'workshop:3429943957',
						name: 'Flaggship Industries',
						path: modDir,
						workshopID: '3429943957'
					}
				]
			},
			{
				indexBlockLookupSources: async (sources) => {
					const recordsBySourcePath = new Map<string, BlockLookupRecord[]>();
					for (const source of sources) {
						recordsBySourcePath.set(source.sourcePath, [
							createTestBlockLookupRecord({
								blockId: source.sourceKind === 'bundle' ? '42' : '',
								blockName: 'GSO-FSI Omni terminal',
								internalName: 'GSO-FSI Omni terminal',
								modTitle: 'Flaggship Industries',
								sourceKind: source.sourceKind,
								sourcePath: source.sourcePath,
								workshopId: '3429943957'
							})
						]);
					}
					return { recordsBySourcePath };
				}
			}
		);

		expect(build.index.records).toHaveLength(1);
		expect(build.index.records[0]).toMatchObject({
			blockId: '42',
			blockName: 'GSO-FSI Omni terminal',
			sourceKind: 'bundle',
			sourcePath: path.normalize(bundlePath)
		});
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

		const firstBuild = await createBlockLookupIndexBuild(
			{ version: BLOCK_LOOKUP_INDEX_VERSION, builtAt: '', renderedPreviewsEnabled: false, sources: [], records: [] },
			request
		);
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
				version: BLOCK_LOOKUP_INDEX_VERSION,
				builtAt: '2026-04-26T00:00:00.000Z',
				renderedPreviewsEnabled: false,
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
		const extractorPath = path.join(tempDir, 'block-lookup-extractor');
		fs.mkdirSync(modDir, { recursive: true });
		fs.writeFileSync(extractorPath, '');
		process.env.TTSMM_BLOCK_LOOKUP_EXTRACTOR_PATH = extractorPath;
		fs.writeFileSync(bundlePath, 'UnityFS\0{"m_Name":"Bundle_Block_Internal","Type":"NuterraBlock","Name":"Bundle Block","ID":77}', 'utf8');
		const stdout = JSON.stringify({
			version: 2,
			files: [
				{
					sourcePath: bundlePath,
					previewAssets: [],
					textAssets: [
						{
							assetName: 'BundleBlocks_bundle',
							text: '{"m_Name":"Bundle_Block_Internal","Type":"NuterraBlock","Name":"Bundle Block","ID":77}'
						}
					],
					errors: []
				}
			]
		});
		vi.spyOn(childProcess, 'execFile').mockImplementation(((_file, _args, _options, callback) => {
			if (typeof callback === 'function') {
				callback(null, stdout, '');
			}
			return {} as childProcess.ChildProcess;
		}) as typeof childProcess.execFile);

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
		const stdout = JSON.stringify({
			version: 2,
			files: [
				{
					sourcePath: bundlePath,
					previewAssets: [],
					textAssets: [
						{
							assetName: 'BundleBlocks_bundle',
							text: 'UnityFS\0{"m_Name":"Bundle_Block_Internal","Type":"NuterraBlock","Name":"Bundle Block","ID":77}'
						}
					],
					errors: []
				}
			]
		});
		vi.spyOn(childProcess, 'execFile').mockImplementation(((_file, _args, _options, callback) => {
			if (typeof callback === 'function') {
				callback(null, stdout, '');
			}
			return {} as childProcess.ChildProcess;
		}) as typeof childProcess.execFile);

		const textAssetsBySource = await extractBundleTextAssets([bundlePath], {
			extractorPath: '/fake/block-lookup-extractor'
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
			version: 2,
			files: [
				{
					sourcePath: firstBundlePath,
					previewAssets: [],
					textAssets: [
						{
							assetName: 'FirstBundle',
							text: '{"Type":"NuterraBlock","Name":"First Bundle Block","ID":21}'
						}
					],
					errors: []
				},
				{
					sourcePath: secondBundlePath,
					previewAssets: [],
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
		const previewCacheDir = path.join(tempDir, 'preview-cache');
		const stdout = JSON.stringify({
			version: 2,
			files: [
				{
					sourcePath: assetBundlePath,
					previewAssets: [],
					textAssets: [
						{
							assetName: 'AssetBundle',
							text: '{"Type":"NuterraBlock","Name":"Asset Bundle Block","ID":21}'
						}
					],
					errors: []
				},
				{
					sourcePath: emptyBundlePath,
					previewAssets: [],
					textAssets: [],
					errors: []
				},
				{
					sourcePath: failedBundlePath,
					previewAssets: [],
					textAssets: [],
					errors: ['Unable to read bundle TextAssets']
				}
			]
		});
		const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((_file, _args, _options, callback) => {
			if (typeof callback === 'function') {
				callback(null, stdout, '');
			}
			return {} as childProcess.ChildProcess;
		}) as typeof childProcess.execFile);

		const outcomes = await extractBundleTextAssetOutcomes([assetBundlePath, emptyBundlePath, failedBundlePath], {
			extractorPath: '/fake/block-lookup-extractor',
			previewCacheDir
		});

		expect(execFileSpy).toHaveBeenCalledWith(
			'/fake/block-lookup-extractor',
			[assetBundlePath, emptyBundlePath, failedBundlePath],
			expect.objectContaining({
				env: expect.objectContaining({
					TTSMM_BLOCK_LOOKUP_PREVIEW_CACHE_DIR: previewCacheDir
				})
			}),
			expect.any(Function)
		);
		expect(outcomes.get(assetBundlePath)).toEqual({
			issues: [],
			previewAssets: [],
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
			previewAssets: [],
			sourcePath: emptyBundlePath,
			status: 'success',
			textAssets: []
		});
		expect(outcomes.get(failedBundlePath)).toEqual({
			issues: ['Unable to read bundle TextAssets'],
			previewAssets: [],
			sourcePath: failedBundlePath,
			status: 'issue',
			textAssets: []
		});
	});

	it('requires the sidecar for bundle text extraction', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-required-sidecar-');
		const bundlePath = path.join(tempDir, 'BundleBlocks_bundle');
		fs.writeFileSync(bundlePath, '{"Type":"NuterraBlock","Name":"Bundle Block","ID":77}', 'utf8');

		await expect(
			extractBundleTextAssets([bundlePath], {
				extractorPath: null
			})
		).rejects.toThrow('Block Lookup native extractor is unavailable');
	});
});
