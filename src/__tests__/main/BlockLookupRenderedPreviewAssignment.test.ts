import path from 'path';
import { describe, expect, it } from 'vitest';
import type { BlockLookupRecord } from '../../shared/block-lookup';
import {
	assignRenderedBlockPreviewsToRecords,
	type BlockLookupRenderedPreviewAsset
} from '../../main/block-lookup-rendered-preview-assignment';

function createRecord(overrides: Partial<BlockLookupRecord> = {}): BlockLookupRecord {
	const blockName = overrides.blockName ?? 'Alpha Cannon';
	const modTitle = overrides.modTitle ?? 'Test Blocks';
	const preferredAlias = overrides.preferredAlias ?? `${blockName.replace(/\s/g, '_')}(${modTitle.replace(/\s/g, '_')})`;
	return {
		blockId: overrides.blockId ?? '42',
		blockName,
		fallbackAlias: overrides.fallbackAlias ?? preferredAlias,
		fallbackSpawnCommand: overrides.fallbackSpawnCommand ?? `SpawnBlock ${preferredAlias}`,
		internalName: overrides.internalName ?? blockName.replace(/\s/g, ''),
		modTitle,
		preferredAlias,
		previewAssetNames: overrides.previewAssetNames,
		sourceKind: overrides.sourceKind ?? 'bundle',
		sourcePath: overrides.sourcePath ?? path.normalize('/mods/TestBlocks_bundle'),
		spawnCommand: overrides.spawnCommand ?? `SpawnBlock ${preferredAlias}`,
		workshopId: overrides.workshopId ?? '12345'
	};
}

function createAsset(overrides: Partial<BlockLookupRenderedPreviewAsset> = {}): BlockLookupRenderedPreviewAsset {
	return {
		assetName: overrides.assetName ?? 'AlphaCannon_preview',
		cacheRelativePath: overrides.cacheRelativePath ?? 'bundle/alpha-cannon.png',
		height: overrides.height ?? 64,
		width: overrides.width ?? 64
	};
}

describe('rendered block preview assignment', () => {
	it('does not assign previews when rendered previews are disabled', () => {
		const [record] = assignRenderedBlockPreviewsToRecords([createRecord()], [createAsset()], { renderedPreviewsEnabled: false });

		expect(record.renderedPreview).toBeUndefined();
	});

	it('does not assign a single unrelated preview asset as a fallback', () => {
		const [record] = assignRenderedBlockPreviewsToRecords(
			[createRecord({ blockName: 'Unrelated Block', internalName: 'Unrelated_Block' })],
			[createAsset({ assetName: 'OnlyAvailableThumbnail', cacheRelativePath: 'bundle/only.png', height: 96, width: 96 })],
			{ renderedPreviewsEnabled: true }
		);

		expect(record.renderedPreview).toBeUndefined();
	});

	it('prefers Blockpedia assets over local assets for the same block', () => {
		const [record] = assignRenderedBlockPreviewsToRecords(
			[createRecord({ blockName: 'GSO Cosmonaut Wide Cab', internalName: 'GSO_Cab_211', preferredAlias: 'GSO_Cab_211' })],
			[
				createAsset({ assetName: 'GSO_Cab_211_preview', cacheRelativePath: 'bundle/local-gso-cab.png' }),
				createAsset({ assetName: 'GSO_Cab_211 GSO Cosmonaut Wide Cab', cacheRelativePath: 'blockpedia/GSO_Cab_211-thumb.jpg' })
			],
			{ renderedPreviewsEnabled: true }
		);

		expect(record.renderedPreview).toMatchObject({
			cacheRelativePath: 'blockpedia/GSO_Cab_211-thumb.jpg'
		});
	});

	it('matches previews when block and asset names use different token order', () => {
		const [record] = assignRenderedBlockPreviewsToRecords(
			[createRecord({ blockName: 'LK Outer Corner Battlement Block', internalName: 'LK_battlement_corner_outer' })],
			[
				createAsset({ assetName: 'LK_corner_outer_icon', cacheRelativePath: 'bundle/partial-preview.png' }),
				createAsset({ assetName: 'LK_outerCorner_battlement_icon', cacheRelativePath: 'bundle/reordered-preview.png' })
			],
			{ renderedPreviewsEnabled: true }
		);

		expect(record.renderedPreview?.cacheRelativePath).toBe('bundle/reordered-preview.png');
	});

	it('matches side-specific blocks to shared family preview assets', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'BF Left Inline Wing', internalName: 'BF Hollow Wing left' }),
				createRecord({ blockName: 'BF Right Inline Wing', internalName: 'BF Hollow Wing Right' }),
				createRecord({ blockName: 'BF Dark Core', internalName: 'BF Dark Core' })
			],
			[createAsset({ assetName: 'BF_Structure_Hollow_preview', cacheRelativePath: 'bundle/bf-hollow-wing.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'BF Hollow Wing left')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/bf-hollow-wing.png'
		);
		expect(records.find((record) => record.internalName === 'BF Hollow Wing Right')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/bf-hollow-wing.png'
		);
		expect(records.find((record) => record.internalName === 'BF Dark Core')?.renderedPreview).toBeUndefined();
	});

	it('matches variant-suffixed internal names to equivalent icon tokens', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'Hawkeye N870 Point-defense gun', internalName: 'HE_minigun_small_VerSteam' }),
				createRecord({ blockName: 'Hawkeye Repeater Cannon', internalName: 'HE_HeavyMG' })
			],
			[createAsset({ assetName: 'HE_Mini_Minigun_icon', cacheRelativePath: 'bundle/he-mini-minigun.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'HE_minigun_small_VerSteam')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/he-mini-minigun.png'
		);
		expect(records.find((record) => record.internalName === 'HE_HeavyMG')?.renderedPreview).toBeUndefined();
	});

	it('matches exact preview asset names parsed from Nuterra IconName metadata', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({
					blockName: 'Hawkeye Jormungand 86 MJ Railcannon',
					internalName: 'HE_Jormungand_Railgun',
					previewAssetNames: ['HE_Jormungand_Railcannon.png', 'HE_Jormungand_Railcannon']
				}),
				createRecord({ blockName: 'Hawkeye Muspell 16 MJ Rapid Railgun', internalName: 'HE_Muspell_Railgun' })
			],
			[createAsset({ assetName: 'HE_Jormungand_Railcannon', cacheRelativePath: 'bundle/he-jormungand.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'HE_Jormungand_Railgun')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/he-jormungand.png'
		);
		expect(records.find((record) => record.internalName === 'HE_Muspell_Railgun')?.renderedPreview).toBeUndefined();
	});

	it('matches generic block names only when IconName supplies the concrete asset name', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({
					blockName: "GeoCorp 'Bedrock' Foundation Block",
					internalName: 'GC_Bedrock_Foundation_Block',
					previewAssetNames: ['GC_Foundation_Icon.png', 'GC_Foundation_Icon']
				}),
				createRecord({ blockName: 'GSO Foundation Block', internalName: 'GSO_Foundation_Block' })
			],
			[
				createAsset({ assetName: 'GC_Foundation_Icon', cacheRelativePath: 'bundle/gc-foundation.png' }),
				createAsset({ assetName: 'GSO_Foundation_Icon', cacheRelativePath: 'bundle/gso-foundation.png' })
			],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'GC_Bedrock_Foundation_Block')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/gc-foundation.png'
		);
		expect(records.find((record) => record.internalName === 'GSO_Foundation_Block')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/gso-foundation.png'
		);
	});

	it('does not match opposite side-specific assets by shared family tokens', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'Hawkeye Left Cirrus Wing', internalName: 'HE_Cirrus_Wing_Left' }),
				createRecord({ blockName: 'Hawkeye Right Cirrus Wing', internalName: 'HE_Cirrus_Wing_Right' })
			],
			[createAsset({ assetName: 'HE_Cirrus_Wing_Left', cacheRelativePath: 'bundle/he-cirrus-left.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'HE_Cirrus_Wing_Left')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/he-cirrus-left.png'
		);
		expect(records.find((record) => record.internalName === 'HE_Cirrus_Wing_Right')?.renderedPreview).toBeUndefined();
	});

	it('does not match different named railguns by corporation and category tokens only', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'Hawkeye Jormungand 86 MJ Railcannon', internalName: 'HE_Jormungand_Railgun' }),
				createRecord({ blockName: 'Hawkeye Muspell 16 MJ Rapid Railgun', internalName: 'HE_Muspell_Railgun' })
			],
			[createAsset({ assetName: 'HE_Muspell_Railgun', cacheRelativePath: 'bundle/he-muspell.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'HE_Jormungand_Railgun')?.renderedPreview).toBeUndefined();
		expect(records.find((record) => record.internalName === 'HE_Muspell_Railgun')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/he-muspell.png'
		);
	});

	it('does not match size-specific assets by corporation and size tokens only', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'Hawkeye Small Nuclear Fuel Cell', internalName: 'HE_Small_Nuclear_Battery' }),
				createRecord({ blockName: 'Hawkeye Small T Bracket', internalName: 'HE_Small_T_Bracket' })
			],
			[createAsset({ assetName: 'HE_Small_T_Bracket', cacheRelativePath: 'bundle/he-small-t-bracket.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'HE_Small_Nuclear_Battery')?.renderedPreview).toBeUndefined();
		expect(records.find((record) => record.internalName === 'HE_Small_T_Bracket')?.renderedPreview?.cacheRelativePath).toBe(
			'bundle/he-small-t-bracket.png'
		);
	});

	it('does not match Blockpedia assets by corporation and grade number only', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'EXP Radar 323', internalName: 'EXPRadar_323', sourceKind: 'vanilla' }),
				createRecord({ blockName: 'EXP RR Laser Gun Test 323', internalName: 'EXP_RR_LaserGun_Test_323', sourceKind: 'vanilla' }),
				createRecord({ blockName: 'EXP Scrapper 322', internalName: 'EXP_Scrapper_322', sourceKind: 'vanilla' })
			],
			[
				createAsset({ assetName: 'EXP_LaserGun_323 Reticule Research Laser Gun', cacheRelativePath: 'blockpedia/EXP_LaserGun_323.jpg' }),
				createAsset({ assetName: 'EXP_Scrapper_322 Reticule Research Scrapper', cacheRelativePath: 'blockpedia/EXP_Scrapper_322.jpg' })
			],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'EXPRadar_323')?.renderedPreview).toBeUndefined();
		expect(records.find((record) => record.internalName === 'EXP_RR_LaserGun_Test_323')?.renderedPreview).toBeUndefined();
		expect(records.find((record) => record.internalName === 'EXP_Scrapper_322')?.renderedPreview?.cacheRelativePath).toBe(
			'blockpedia/EXP_Scrapper_322.jpg'
		);
	});

	it('leaves unmatched records without placeholder previews', () => {
		const records = assignRenderedBlockPreviewsToRecords(
			[
				createRecord({ blockName: 'Alpha Block', internalName: 'Alpha_Block' }),
				createRecord({ blockName: 'Beta Block', internalName: 'Beta_Block' })
			],
			[createAsset({ assetName: 'Alpha_Block_preview', cacheRelativePath: 'bundle/alpha-preview.png' })],
			{ renderedPreviewsEnabled: true }
		);

		expect(records.find((record) => record.internalName === 'Alpha_Block')?.renderedPreview).toBeDefined();
		expect(records.find((record) => record.internalName === 'Beta_Block')?.renderedPreview).toBeUndefined();
	});
});
