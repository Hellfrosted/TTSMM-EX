import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	ModErrorType,
	ModType,
	createCollectionValidationResultPolicy,
	getCollectionStatusTags,
	getModDataDependencyIgnoreKey,
	getModDescriptorKey
} from '../../model';
import type { CollectionErrors } from '../../model';

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
		expect(
			getCollectionStatusTags({
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
			})
		).toEqual([
			{ text: 'Invalid ID', tone: 'danger', rank: 0 },
			{ text: 'Missing dependencies', tone: 'warning', rank: 2 },
			{ text: 'Not installed', tone: 'warning', rank: 5 }
		]);

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

		expect(result).toEqual({
			hasBlockingErrors: false,
			hasWarnings: false,
			outcome: 'valid',
			success: true,
			summary: {
				affectedMods: 0,
				missingDependencies: 0,
				incompatibleMods: 0,
				invalidIds: 0,
				subscriptionIssues: 0,
				installIssues: 0,
				updateIssues: 0
			}
		});
		expect(errors['local:a'].missingDependencies).toEqual([dependency]);
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
	});
});
