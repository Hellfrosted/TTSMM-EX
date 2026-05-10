import { describe, expect, it } from 'vitest';
import { compareModDataDisplayId, compareModDataDisplayName, getModDataDisplayId, getModDataDisplayName, ModType } from '../../model/Mod';

describe('mod display ids', () => {
	it('prefers the workshop id for workshop mods', () => {
		expect(
			getModDataDisplayId({
				uid: `${ModType.WORKSHOP}:42`,
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'InternalModId',
				overrides: {
					id: 'OverriddenModId'
				}
			})
		).toBe('42');
	});

	it('falls back to the overridden internal id for non-workshop mods', () => {
		expect(
			getModDataDisplayId({
				uid: `${ModType.LOCAL}:mod-a`,
				type: ModType.LOCAL,
				id: 'InternalModId',
				overrides: {
					id: 'OverriddenModId'
				}
			})
		).toBe('OverriddenModId');
	});

	it('sorts workshop ids numerically', () => {
		expect(
			compareModDataDisplayId(
				{
					uid: `${ModType.WORKSHOP}:9`,
					type: ModType.WORKSHOP,
					workshopID: BigInt(9),
					id: 'Nine'
				},
				{
					uid: `${ModType.WORKSHOP}:42`,
					type: ModType.WORKSHOP,
					workshopID: BigInt(42),
					id: 'FortyTwo'
				}
			)
		).toBeLessThan(0);
	});
});

describe('mod display names', () => {
	it('prefers the overridden mod id over the raw name', () => {
		expect(
			getModDataDisplayName({
				uid: `${ModType.WORKSHOP}:42`,
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: 'InternalModId',
				name: 'Fancy Mod v1.6.1.1',
				overrides: {
					id: 'OverriddenModId'
				}
			})
		).toBe('OverriddenModId');
	});

	it('falls back to the raw name when no mod id exists', () => {
		expect(
			getModDataDisplayName({
				uid: `${ModType.WORKSHOP}:42`,
				type: ModType.WORKSHOP,
				workshopID: BigInt(42),
				id: null,
				name: 'Fancy Mod v1.6.1.1'
			})
		).toBe('Fancy Mod v1.6.1.1');
	});

	it('sorts by the displayed mod name', () => {
		expect(
			compareModDataDisplayName(
				{
					uid: `${ModType.WORKSHOP}:9`,
					type: ModType.WORKSHOP,
					workshopID: BigInt(9),
					id: 'AlphaMod',
					name: 'Zeta Mod'
				},
				{
					uid: `${ModType.WORKSHOP}:42`,
					type: ModType.WORKSHOP,
					workshopID: BigInt(42),
					id: 'BetaMod',
					name: 'Alpha Mod'
				}
			)
		).toBeLessThan(0);
	});
});
