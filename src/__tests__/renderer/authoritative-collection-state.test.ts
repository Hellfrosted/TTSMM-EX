import { describe, expect, it, vi } from 'vitest';
import type { AppConfig, ModCollection } from '../../model';
import {
	type AuthoritativeCollectionState,
	applyAuthoritativeCollectionState,
	getAuthoritativeCollectionStateUpdate,
	getCollectionContentSaveStateUpdate
} from '../../renderer/authoritative-collection-state';
import { DEFAULT_CONFIG } from '../../renderer/Constants';

function config(activeCollection: string): AppConfig {
	return {
		...DEFAULT_CONFIG,
		activeCollection,
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map()
	};
}

function state(activeCollection: ModCollection, collections: ModCollection[]): AuthoritativeCollectionState {
	return {
		ok: true,
		activeCollection,
		collections,
		collectionNames: collections.map((collection) => collection.name),
		config: config(activeCollection.name)
	};
}

describe('authoritative Collection state application', () => {
	it('applies active collection, collection maps, names, config, and cache sync together', () => {
		const alpha = { name: 'alpha', mods: ['local:a'] };
		const zeta = { name: 'zeta', mods: [] };
		const result = state(alpha, [alpha, zeta]);
		const updateState = vi.fn();
		const syncCache = vi.fn();

		applyAuthoritativeCollectionState(result, { syncCache, updateState });

		expect(updateState).toHaveBeenCalledOnce();
		const update = updateState.mock.calls[0]?.[0];
		expect(update).toMatchObject({
			activeCollection: alpha,
			config: expect.objectContaining({ activeCollection: 'alpha' })
		});
		expect(update?.allCollectionNames).toEqual(new Set(['alpha', 'zeta']));
		expect(update?.allCollections).toEqual(
			new Map([
				['alpha', alpha],
				['zeta', zeta]
			])
		);
		expect(update?.activeCollection).not.toBe(alpha);
		expect(update?.activeCollection?.mods).not.toBe(alpha.mods);
		expect(update?.allCollections?.get('alpha')).toBe(update?.activeCollection);
		expect(syncCache).toHaveBeenCalledWith(result);
	});

	it('creates fresh state projections on repeated application and drops stale collection names', () => {
		const alpha = { name: 'alpha', mods: ['local:a'] };
		const renamed = { name: 'renamed', mods: ['local:a'] };

		const firstUpdate = getAuthoritativeCollectionStateUpdate(state(alpha, [alpha]));
		const secondUpdate = getAuthoritativeCollectionStateUpdate(state(renamed, [renamed]));

		expect(firstUpdate.allCollections).not.toBe(secondUpdate.allCollections);
		expect(firstUpdate.allCollectionNames).not.toBe(secondUpdate.allCollectionNames);
		expect(secondUpdate.allCollections?.has('alpha')).toBe(false);
		expect(secondUpdate.allCollections?.has('renamed')).toBe(true);
		expect(secondUpdate.allCollectionNames).toEqual(new Set(['renamed']));
	});

	it('projects accepted collection content saves into AppState collection ownership', () => {
		const activeCollection = { name: 'default', mods: ['local:old'] };
		const otherCollection = { name: 'other', mods: ['local:other'] };
		const savedCollection = { name: 'default', mods: ['local:new'] };

		const update = getCollectionContentSaveStateUpdate(
			{
				activeCollection,
				allCollections: new Map([
					['default', activeCollection],
					['other', otherCollection]
				])
			},
			savedCollection
		);

		expect(update.activeCollection).toEqual(savedCollection);
		expect(update.activeCollection).not.toBe(savedCollection);
		expect(update.allCollections).toEqual(
			new Map([
				['default', savedCollection],
				['other', otherCollection]
			])
		);
		expect(update.allCollections.get('default')).toBe(update.activeCollection);
		expect(update.allCollections.get('other')).toBe(otherCollection);
	});

	it('rejects failed authoritative results', () => {
		expect(() =>
			getAuthoritativeCollectionStateUpdate({
				ok: false,
				code: 'collection-read-failed',
				message: 'Failed to load collection "broken"'
			} as never)
		).toThrow('Cannot apply failed authoritative Collection state result');
	});
});
