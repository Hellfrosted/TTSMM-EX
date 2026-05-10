import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readBlockLookupIndex, searchBlockLookupIndex } from '../../main/block-lookup';
import { searchBlockLookupRecords } from '../../main/block-lookup-search';
import { BLOCK_LOOKUP_INDEX_VERSION, type BlockLookupRecord } from '../../shared/block-lookup';
import { createTempDir } from './test-utils';

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
				version: BLOCK_LOOKUP_INDEX_VERSION,
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

		expect(searchBlockLookupRecords({ version: BLOCK_LOOKUP_INDEX_VERSION, builtAt: '', sources: [], records: [] }, '', 10)).toEqual({
			rows: [],
			stats: null
		});

		const result = searchBlockLookupRecords(
			{
				version: BLOCK_LOOKUP_INDEX_VERSION,
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
				version: BLOCK_LOOKUP_INDEX_VERSION,
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
		const indexPath = path.join(userDataPath, 'block-lookup-index.json');
		fs.mkdirSync(userDataPath, { recursive: true });
		fs.writeFileSync(
			indexPath,
			JSON.stringify({
				version: 999,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: [],
				records: []
			}),
			'utf8'
		);

		expect(readBlockLookupIndex(userDataPath)).toEqual({
			version: BLOCK_LOOKUP_INDEX_VERSION,
			builtAt: '',
			sources: [],
			records: []
		});
		expect(searchBlockLookupIndex(userDataPath, 'cab')).toEqual({
			rows: [],
			stats: null
		});

		fs.writeFileSync(
			indexPath,
			JSON.stringify({
				version: BLOCK_LOOKUP_INDEX_VERSION,
				builtAt: '2026-04-26T00:00:00.000Z',
				sources: {},
				records: {}
			}),
			'utf8'
		);

		expect(readBlockLookupIndex(userDataPath)).toEqual({
			version: BLOCK_LOOKUP_INDEX_VERSION,
			builtAt: '',
			sources: [],
			records: []
		});
	});
});
