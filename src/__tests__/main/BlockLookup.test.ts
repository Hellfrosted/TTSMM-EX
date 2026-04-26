import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildBlockLookupAliases,
	buildBlockLookupIndex,
	extractNuterraBlocksFromText,
	searchBlockLookupIndex
} from '../../main/block-lookup';
import { createBlockLookupIndexer } from '../../main/block-lookup-indexer';
import { createBlockLookupIndexPlan } from '../../main/block-lookup-index-planner';
import { collectBlockLookupSources } from '../../main/block-lookup-source-discovery';
import { registerBlockLookupHandlers } from '../../main/ipc/block-lookup-handlers';
import { ValidChannel } from '../../shared/ipc';
import { createTempDir, createValidIpcEvent } from './test-utils';

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

	it('uses Python UnityPy extraction for bundle sources when available', async () => {
		const tempDir = createTempDir('ttsmm-block-lookup-bundle-');
		const userDataPath = path.join(tempDir, 'user-data');
		const modDir = path.join(tempDir, 'SteamLibrary', 'steamapps', 'workshop', 'content', '285920', '24680');
		const bundlePath = path.join(modDir, 'BundleBlocks_bundle');
		fs.mkdirSync(modDir, { recursive: true });
		fs.writeFileSync(bundlePath, 'compressed unity asset bundle', 'utf8');

		vi.spyOn(childProcess, 'execFile').mockImplementation((...args: unknown[]) => {
			const callback = args.find((arg): arg is (error: Error | null, stdout: string, stderr: string) => void => typeof arg === 'function');
			callback?.(
				null,
				JSON.stringify({
					available: true,
					results: {
						[bundlePath]: [
							{
								blockName: 'Bundle Block',
								blockId: '77',
								internalName: 'Bundle_Block_Internal'
							}
						]
					}
				}),
				''
			);
			return { stdin: { end: vi.fn() } } as never;
		});

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
});

describe('block lookup indexer facade', () => {
	it('delegates settings, stats, and search to one user data boundary', () => {
		const userDataPath = createTempDir('ttsmm-block-lookup-indexer-');
		const indexer = createBlockLookupIndexer(userDataPath);
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
