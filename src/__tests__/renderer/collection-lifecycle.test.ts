import { describe, expect, it } from 'vitest';
import type { AppConfig, ModCollection } from '../../model';
import {
	createCollectionSnapshot,
	deleteActiveCollectionSnapshot,
	duplicateActiveCollectionSnapshot,
	renameActiveCollectionSnapshot,
	switchActiveCollectionSnapshot,
	type CollectionWorkspaceSnapshot
} from '../../renderer/collection-lifecycle';

function config(activeCollection?: string): AppConfig {
	return {
		closeOnLaunch: false,
		language: 'english',
		gameExec: '',
		workshopID: 0n,
		logsDir: '',
		activeCollection,
		steamMaxConcurrency: 5,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map()
	};
}

function snapshot(collections: ModCollection[], activeCollectionName?: string): CollectionWorkspaceSnapshot {
	const allCollections = new Map(collections.map((collection) => [collection.name, collection]));
	return {
		activeCollection: activeCollectionName ? allCollections.get(activeCollectionName) : undefined,
		allCollectionNames: new Set(allCollections.keys()),
		allCollections,
		config: config(activeCollectionName)
	};
}

describe('collection-lifecycle', () => {
	it('creates and activates a collection snapshot without mutating existing collections', () => {
		const current = snapshot([{ name: 'default', mods: ['a'] }], 'default');
		const result = createCollectionSnapshot(current, 'fresh', ['b']);

		expect(result.activeCollection).toEqual({ name: 'fresh', mods: ['b'] });
		expect(result.allCollectionNames.has('fresh')).toBe(true);
		expect(result.config.activeCollection).toBe('fresh');
		expect(current.allCollections.has('fresh')).toBe(false);
	});

	it('duplicates the active collection with cloned selected mods', () => {
		const current = snapshot([{ name: 'default', mods: ['a'] }], 'default');
		const result = duplicateActiveCollectionSnapshot(current, 'copy');

		expect(result?.activeCollection).toEqual({ name: 'copy', mods: ['a'] });
		expect(result?.activeCollection.mods).not.toBe(current.activeCollection?.mods);
	});

	it('renames the active collection and updates name indexes', () => {
		const result = renameActiveCollectionSnapshot(snapshot([{ name: 'old', mods: ['a'] }], 'old'), 'new');

		expect(result?.allCollections.has('old')).toBe(false);
		expect(result?.allCollectionNames.has('old')).toBe(false);
		expect(result?.activeCollection.name).toBe('new');
		expect(result?.config.activeCollection).toBe('new');
	});

	it('selects the next sorted collection after delete', () => {
		const result = deleteActiveCollectionSnapshot(
			snapshot(
				[
					{ name: 'zeta', mods: [] },
					{ name: 'alpha', mods: [] }
				],
				'zeta'
			)
		);

		expect(result?.activeCollection.name).toBe('alpha');
		expect(result?.createdFallbackCollection).toBe(false);
	});

	it('creates a default fallback when deleting the last collection', () => {
		const result = deleteActiveCollectionSnapshot(snapshot([{ name: 'only', mods: ['a'] }], 'only'));

		expect(result?.activeCollection).toEqual({ name: 'default', mods: [] });
		expect(result?.createdFallbackCollection).toBe(true);
		expect(result?.config.activeCollection).toBe('default');
	});

	it('switches active collection through a cloned active collection', () => {
		const result = switchActiveCollectionSnapshot(
			snapshot(
				[
					{ name: 'one', mods: ['a'] },
					{ name: 'two', mods: ['b'] }
				],
				'one'
			),
			'two'
		);

		expect(result?.activeCollection).toEqual({ name: 'two', mods: ['b'] });
		expect(result?.activeCollection).not.toBe(result?.allCollections.get('two'));
		expect(result?.config.activeCollection).toBe('two');
	});
});
