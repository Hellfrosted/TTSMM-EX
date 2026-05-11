import { describe, expect, it } from 'vitest';
import type { AppConfig, CollectionErrors, ModCollection } from '../../model';
import { CollectionManagerModalType, ModErrorType, ModType, SessionMods } from '../../model';
import {
	getCollectionValidationKey,
	getValidationIssueList,
	renderValidationErrors,
	summarizeValidationIssues
} from '../../renderer/collection-validation-run';

function config(overrides?: Partial<AppConfig>): AppConfig {
	return {
		closeOnLaunch: false,
		language: 'english',
		gameExec: '',
		workshopID: 0n,
		logsDir: '',
		steamMaxConcurrency: 5,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map(),
		...overrides
	};
}

describe('collection-validation-run', () => {
	it('creates stable validation keys from collection membership and validation config', () => {
		const collection: ModCollection = { name: 'default', mods: ['b', 'a'] };
		const firstConfig = config();
		const secondConfig = config({
			userOverrides: new Map([['a', { id: 'override' }]])
		});

		expect(getCollectionValidationKey(collection, firstConfig)).toBe(
			getCollectionValidationKey({ ...collection, mods: ['a', 'b'] }, firstConfig)
		);
		expect(getCollectionValidationKey(collection, firstConfig)).not.toBe(getCollectionValidationKey(collection, secondConfig));
	});

	it('renders blocking validation errors without mutating the raw errors', () => {
		const mod = { uid: 'local:a', id: 'a', name: 'Local A', type: ModType.LOCAL };
		const mods = new SessionMods('', [mod]);
		const errors: CollectionErrors = {
			'local:a': {
				invalidId: true,
				missingDependencies: [{ UIDs: new Set(), modID: 'MissingMod' }]
			}
		};

		const result = renderValidationErrors(mods, errors, config(), true);

		expect(result.success).toBe(false);
		expect(result.modalType).toBe(CollectionManagerModalType.ERRORS_FOUND);
		expect(result.errors?.['local:a']).toMatchObject({
			invalidId: true
		});
		expect(mod).not.toHaveProperty('errors');
		expect(errors['local:a'].missingDependencies).toHaveLength(1);
	});

	it('treats subscription and install issues as launch warnings', () => {
		const mods = new SessionMods('', [{ uid: 'workshop:a', id: 'a', name: 'Workshop A', type: ModType.WORKSHOP }]);
		const result = renderValidationErrors(
			mods,
			{
				'workshop:a': {
					notInstalled: true,
					needsUpdate: true
				}
			},
			config(),
			true
		);

		expect(result.success).toBe(false);
		expect(result.modalType).toBe(CollectionManagerModalType.WARNINGS_FOUND);
	});

	it('applies ignored dependency and incompatibility errors before classifying success', () => {
		const mods = new SessionMods('', [
			{ uid: 'local:a', id: 'a', name: 'Local A', type: ModType.LOCAL },
			{ uid: 'local:b', id: 'b', name: 'Local B', type: ModType.LOCAL }
		]);
		const dependency = { UIDs: new Set<string>(), modID: 'MissingMod' };
		const result = renderValidationErrors(
			mods,
			{
				'local:a': {
					incompatibleMods: ['local:b'],
					missingDependencies: [dependency]
				}
			},
			config({
				ignoredValidationErrors: new Map([
					[ModErrorType.INCOMPATIBLE_MODS, { 'local:a': ['local:b'] }],
					[ModErrorType.MISSING_DEPENDENCIES, { 'local:a': ['MissingMod'] }]
				])
			}),
			true
		);

		expect(result.success).toBe(true);
		expect(result.modalType).toBeUndefined();
		expect(result.errors).toBeUndefined();
	});

	it('summarizes validation issue categories for logging', () => {
		expect(
			summarizeValidationIssues({
				a: { invalidId: true, notSubscribed: true },
				b: { missingDependencies: [{ UIDs: new Set(), modID: 'MissingMod' }], incompatibleMods: ['a'] },
				c: { notInstalled: true, needsUpdate: true }
			})
		).toEqual({
			affectedMods: 3,
			missingDependencies: 1,
			incompatibleMods: 1,
			invalidIds: 1,
			subscriptionIssues: 1,
			installIssues: 1,
			updateIssues: 1
		});
	});

	it('projects validation issue rows for presentation', () => {
		const brokenMod = { uid: 'workshop:1', id: 'BrokenMod', name: 'Broken Mod', type: ModType.WORKSHOP };
		const conflictingMod = { uid: 'workshop:2', id: 'ConflictingMod', name: 'Conflicting Mod', type: ModType.WORKSHOP };
		const mods = new SessionMods('', [brokenMod, conflictingMod]);
		mods.modIdToModDataMap.set(brokenMod.uid, brokenMod);
		mods.modIdToModDataMap.set(conflictingMod.uid, conflictingMod);

		expect(
			getValidationIssueList(
				{
					[brokenMod.uid]: {
						invalidId: true,
						missingDependencies: [{ UIDs: new Set(), name: 'NuterraSteam (Beta)' }],
						incompatibleMods: [conflictingMod.uid],
						notInstalled: true
					}
				},
				mods
			)
		).toEqual([
			{
				uid: brokenMod.uid,
				label: 'Broken Mod',
				issues: ['Invalid mod ID', 'Missing dependencies: NuterraSteam (Beta)', 'Conflicts with: Conflicting Mod', 'Not installed']
			}
		]);
	});
});
