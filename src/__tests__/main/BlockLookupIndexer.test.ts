import { Effect } from 'effect';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockLookupIndexModule } from '../../main/block-lookup-indexer';
import { collectBlockLookupSources } from '../../main/block-lookup-source-discovery';
import Steamworks from '../../main/steamworks';
import { BLOCK_LOOKUP_INDEX_VERSION, type BlockLookupBuildResult } from '../../shared/block-lookup';
import { createTempDir, mockSteamworksBlockLookupInstallState } from './test-utils';

beforeEach(() => {
	mockSteamworksBlockLookupInstallState();
});

afterEach(() => {
	vi.restoreAllMocks();
});

function createBlockLookupBuildResult(builtAt: string): BlockLookupBuildResult {
	return {
		stats: {
			sources: 0,
			scanned: 0,
			skipped: 0,
			removed: 0,
			blocks: 0,
			updatedBlocks: 0,
			renderedPreviewsEnabled: false,
			renderedPreviews: 0,
			unavailablePreviews: 0,
			builtAt
		}
	};
}

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
		const buildResult = await Effect.runPromise(
			indexModule.buildIndex({
				workshopRoot,
				modSources: [
					{
						uid: 'workshop:12345',
						name: 'Test Blocks',
						path: modDir,
						workshopID: '12345'
					}
				]
			})
		);

		expect(buildResult.stats).toEqual({
			sources: 1,
			scanned: 1,
			skipped: 0,
			removed: 0,
			blocks: 1,
			updatedBlocks: 1,
			renderedPreviewsEnabled: false,
			renderedPreviews: 0,
			unavailablePreviews: 0,
			builtAt: expect.any(String)
		});
		expect(indexModule.readSettings()).toEqual({ workshopRoot: '', renderedPreviewsEnabled: false });
		expect(indexModule.getStats()).toEqual({
			sources: 1,
			scanned: 0,
			skipped: 0,
			removed: 0,
			blocks: 1,
			updatedBlocks: 0,
			renderedPreviewsEnabled: false,
			renderedPreviews: 0,
			unavailablePreviews: 0,
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
			version: BLOCK_LOOKUP_INDEX_VERSION,
			builtAt: buildResult.stats.builtAt,
			renderedPreviewsEnabled: false,
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
			],
			sourceRecords: [
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

		expect(indexer.readSettings()).toEqual({ workshopRoot: '', renderedPreviewsEnabled: false });
		expect(indexer.saveSettings({ workshopRoot: '  C:/Steam/workshop/content/285920  ', renderedPreviewsEnabled: true })).toEqual({
			workshopRoot,
			renderedPreviewsEnabled: true
		});
		expect(indexer.readSettings()).toEqual({ workshopRoot, renderedPreviewsEnabled: true });
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
					version: BLOCK_LOOKUP_INDEX_VERSION,
					builtAt: '2026-04-26T00:00:00.000Z',
					renderedPreviewsEnabled: false,
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
			buildBlockLookupIndex: () => {
				fs.writeFileSync(
					indexPath,
					JSON.stringify(
						{
							version: BLOCK_LOOKUP_INDEX_VERSION,
							builtAt: '2026-04-26T01:00:00.000Z',
							renderedPreviewsEnabled: false,
							sources: [],
							records: []
						},
						null,
						2
					),
					'utf8'
				);
				return Effect.succeed({
					stats: {
						sources: 0,
						scanned: 0,
						skipped: 0,
						removed: 0,
						blocks: 0,
						updatedBlocks: 0,
						renderedPreviewsEnabled: false,
						renderedPreviews: 0,
						unavailablePreviews: 0,
						builtAt: '2026-04-26T01:00:00.000Z'
					}
				});
			}
		});

		expect(indexer.search({ query: 'alpha', limit: 10 }).rows).toHaveLength(1);
		expect(indexer.search({ query: 'cannon', limit: 10 }).rows).toHaveLength(1);
		expect(readCount).toBe(1);

		await Effect.runPromise(
			indexer.buildIndex({ workshopRoot: path.join(userDataPath, 'missing-workshop-root'), modSources: [], forceRebuild: true })
		);

		expect(indexer.search({ query: 'alpha', limit: 10 })).toMatchObject({
			rows: [],
			stats: expect.objectContaining({ blocks: 0 })
		});
		expect(readCount).toBe(2);
	});

	it('serializes concurrent builds before touching the persisted index cache', async () => {
		const startedBuilds: string[] = [];
		const releaseBuilds: Array<(result: BlockLookupBuildResult) => void> = [];
		const indexer = createBlockLookupIndexModule('/tmp/ttsmm-block-lookup-serialized-builds', {
			buildBlockLookupIndex: (_userDataPath, request) =>
				Effect.callback<BlockLookupBuildResult>((resume) => {
					startedBuilds.push(request.workshopRoot);
					releaseBuilds.push((result) => resume(Effect.succeed(result)));
				})
		});

		const firstBuild = Effect.runPromise(indexer.buildIndex({ workshopRoot: 'first', modSources: [] }));
		const secondBuild = Effect.runPromise(indexer.buildIndex({ workshopRoot: 'second', modSources: [] }));
		await Promise.resolve();

		expect(startedBuilds).toEqual(['first']);

		releaseBuilds[0](createBlockLookupBuildResult('2026-04-26T01:00:00.000Z'));
		await firstBuild;
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(startedBuilds).toEqual(['first', 'second']);

		releaseBuilds[1](createBlockLookupBuildResult('2026-04-26T02:00:00.000Z'));
		await secondBuild;
	});
});
