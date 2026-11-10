import { describe, expect, it } from 'vitest';
import type { CollectionErrors } from '../../model';
import {
	createCollectionValidationResultPolicy,
	getCollectionStatusTags,
	getModDataDependencyIgnoreKey,
	getModDescriptorKey,
	ModErrorType,
	ModType
} from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';

describe('collection validation result policy', () => {
	it('uses one dependency ignore key for descriptors and dependency table records', () => {
		expect(getModDescriptorKey({ UIDs: new Set(), modID: 'MissingMod' })).toBe('MissingMod');
		expect(getModDataDependencyIgnoreKey({ uid: 'descriptor:MissingMod', id: 'MissingMod', type: ModType.DESCRIPTOR })).toBe('MissingMod');
		expect(getModDescriptorKey({ UIDs: new Set(), workshopID: BigInt(123) })).toBe('workshop:123');
		expect(
			getModDataDependencyIgnoreKey({
				uid: 'descriptor:workshop:123',
				id: null,
				type: ModType.DESCRIPTOR,
				workshopID: BigInt(123)
			})
		).toBe('workshop:123');
	});

	it('projects collection status tags from one model helper', () => {
		const invalidTags = getCollectionStatusTags({
			record: {
				uid: 'local:a',
				id: 'a',
				type: ModType.LOCAL,
				errors: {
					invalidId: true,
					missingDependencies: [{ UIDs: new Set(), modID: 'MissingMod' }],
					notInstalled: true
				}
			},
			selectedMods: ['local:a'],
			lastValidationStatus: false
		});

		expect(invalidTags.map((tag) => tag.text)).toEqual(['Invalid ID', 'Missing dependencies', 'Not installed']);
		expect(invalidTags).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: 'Invalid ID', tone: 'danger', rank: 0 }),
				expect.objectContaining({ text: 'Missing dependencies', tone: 'warning', rank: 2 }),
				expect.objectContaining({ text: 'Not installed', tone: 'warning', rank: 5 })
			])
		);

		expect(
			getCollectionStatusTags({
				record: { uid: 'workshop:10', id: 'Dependency', type: ModType.WORKSHOP, workshopID: BigInt(10), subscribed: false },
				selectedMods: []
			})
		).toEqual([{ text: 'Not subscribed', tone: 'warning', rank: 4 }]);

		expect(
			getCollectionStatusTags({
				record: {
					uid: 'descriptor:Dependency',
					id: 'Dependency',
					type: ModType.DESCRIPTOR,
					children: [
						{ uid: 'local:a', id: 'Dependency', type: ModType.LOCAL },
						{ uid: 'local:b', id: 'Dependency', type: ModType.LOCAL }
					]
				},
				selectedMods: ['local:a', 'local:b']
			})
		).toEqual([{ text: 'Conflicts', tone: 'danger', rank: 1 }]);

		expect(
			getCollectionStatusTags({
				record: {
					uid: 'workshop:11',
					id: 'Mod',
					type: ModType.WORKSHOP,
					errors: {
						incompatibleMods: ['other'],
						invalidId: true,
						unknownWorkshopDependencies: true,
						notSubscribed: true,
						notInstalled: true,
						needsUpdate: true
					}
				},
				selectedMods: ['workshop:11']
			}).map((tag) => tag.text)
		).toEqual(['Conflicts', 'Invalid ID', 'Dependencies unknown', 'Not subscribed']);
	});

	it('applies ignored errors before classifying the validation outcome', () => {
		const dependency = { UIDs: new Set<string>(), modID: 'MissingMod' };
		const errors: CollectionErrors = {
			'local:a': {
				incompatibleMods: ['local:b'],
				missingDependencies: [dependency]
			}
		};

		const result = createCollectionValidationResultPolicy(errors, {
			...DEFAULT_CONFIG,
			ignoredValidationErrors: new Map([
				[ModErrorType.INCOMPATIBLE_MODS, { 'local:a': ['local:b'] }],
				[ModErrorType.MISSING_DEPENDENCIES, { 'local:a': ['MissingMod'] }]
			])
		});

		expect(result).toEqual(
			expect.objectContaining({
				hasBlockingErrors: false,
				hasWarnings: false,
				outcome: 'valid',
				success: true,
				summary: expect.objectContaining({
					affectedMods: 0,
					missingDependencies: 0,
					incompatibleMods: 0
				})
			})
		);
		expect(result.errors).toBeUndefined();
		expect(errors['local:a'].missingDependencies).toEqual([dependency]);
	});

	it('removes an invalid-id issue only when the user ignored it', () => {
		const errors: CollectionErrors = { 'local:a': { invalidId: true } };
		const ignored = createCollectionValidationResultPolicy(errors, {
			...DEFAULT_CONFIG,
			ignoredValidationErrors: new Map([[ModErrorType.INVALID_ID, { 'local:a': ['Invalid mod ID'] }]])
		});

		expect(ignored).toEqual(
			expect.objectContaining({
				hasBlockingErrors: false,
				outcome: 'valid',
				success: true
			})
		);
		expect(ignored.errors).toBeUndefined();
		expect(errors['local:a'].invalidId).toBe(true);
		expect(createCollectionValidationResultPolicy(errors, DEFAULT_CONFIG).outcome).toBe('blocked');
	});

	it('classifies blocking errors separately from launch warnings', () => {
		expect(
			createCollectionValidationResultPolicy(
				{
					'local:a': {
						invalidId: true
					}
				},
				DEFAULT_CONFIG
			).outcome
		).toBe('blocked');

		expect(
			createCollectionValidationResultPolicy(
				{
					'workshop:a': {
						notInstalled: true,
						needsUpdate: true
					}
				},
				DEFAULT_CONFIG
			).outcome
		).toBe('warnings');

		const unknown = createCollectionValidationResultPolicy({ 'workshop:a': { unknownWorkshopDependencies: true } }, DEFAULT_CONFIG);
		expect(unknown.outcome).toBe('warnings');
		expect(unknown.summary.unknownWorkshopDependencies).toBe(1);
	});
});
