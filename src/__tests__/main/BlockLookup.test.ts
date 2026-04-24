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
import { createTempDir } from './test-utils';

afterEach(() => {
	vi.restoreAllMocks();
});

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
