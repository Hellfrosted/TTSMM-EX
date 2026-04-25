import { describe, expect, it, vi } from 'vitest';
import type { AppConfig, ModCollection } from '../../model';
import type { CollectionWorkspaceSnapshot } from '../../renderer/collection-lifecycle';
import {
	runCreateCollectionTransaction,
	runDuplicateCollectionTransaction
} from '../../renderer/collection-lifecycle-transactions';

function config(activeCollection?: string): AppConfig {
	return {
		closeOnLaunch: false,
		language: 'english',
		gameExec: '',
		workshopID: BigInt(0),
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

function transactionAdapters(calls: string[] = []) {
	return {
		calls,
		persistDirtyCollection: vi.fn(async (collection: ModCollection) => {
			calls.push(`dirty:${collection.name}`);
			return true;
		}),
		updateCollection: vi.fn(async (collection: ModCollection) => {
			calls.push(`update:${collection.name}`);
			return true;
		}),
		deleteCollection: vi.fn(async (name: string) => {
			calls.push(`delete:${name}`);
			return true;
		}),
		writeConfig: vi.fn(async (nextConfig: AppConfig) => {
			calls.push(`config:${nextConfig.activeCollection ?? ''}`);
		}),
		onBeforeNewCollectionWrite: vi.fn(() => {
			calls.push('before-new');
		})
	};
}

describe('collection-lifecycle-transactions', () => {
	it('persists dirty active collections before creating and activating the new collection', async () => {
		const current = snapshot([{ name: 'default', mods: ['local:dirty'] }], 'default');
		const adapters = transactionAdapters();

		const result = await runCreateCollectionTransaction({
			snapshot: current,
			name: 'fresh',
			mods: ['local:new'],
			dirtyCollection: current.activeCollection,
			...adapters
		});

		expect(result.committed).toBe(true);
		expect(adapters.calls).toEqual(['dirty:default', 'before-new', 'update:fresh', 'config:fresh']);
		expect(result.lifecycleResult?.activeCollection).toEqual({ name: 'fresh', mods: ['local:new'] });
		expect(current.allCollections.has('fresh')).toBe(false);
	});

	it('duplicates the active collection through the same ordered create transaction', async () => {
		const current = snapshot([{ name: 'default', mods: ['local:a'] }], 'default');
		const adapters = transactionAdapters();

		const result = await runDuplicateCollectionTransaction({
			snapshot: current,
			name: 'copy',
			dirtyCollection: current.activeCollection,
			...adapters
		});

		expect(result.committed).toBe(true);
		expect(adapters.calls).toEqual(['dirty:default', 'before-new', 'update:copy', 'config:copy']);
		expect(result.lifecycleResult?.activeCollection).toEqual({ name: 'copy', mods: ['local:a'] });
		expect(result.lifecycleResult?.activeCollection.mods).not.toBe(current.activeCollection?.mods);
	});

	it('does not write the new collection when dirty collection persistence fails', async () => {
		const current = snapshot([{ name: 'default', mods: ['local:dirty'] }], 'default');
		const adapters = transactionAdapters();
		adapters.persistDirtyCollection.mockImplementationOnce(async (collection: ModCollection) => {
			adapters.calls.push(`dirty:${collection.name}`);
			return false;
		});

		const result = await runCreateCollectionTransaction({
			snapshot: current,
			name: 'fresh',
			dirtyCollection: current.activeCollection,
			...adapters
		});

		expect(result).toEqual({
			committed: false,
			failureReason: 'dirty-collection-write-failed'
		});
		expect(adapters.calls).toEqual(['dirty:default']);
		expect(adapters.updateCollection).not.toHaveBeenCalled();
		expect(adapters.writeConfig).not.toHaveBeenCalled();
	});

	it('rolls back the new collection when config persistence fails', async () => {
		const current = snapshot([{ name: 'default', mods: [] }], 'default');
		const adapters = transactionAdapters();
		const error = new Error('config write failed');
		adapters.writeConfig.mockImplementationOnce(async (nextConfig: AppConfig) => {
			adapters.calls.push(`config:${nextConfig.activeCollection ?? ''}`);
			throw error;
		});

		const result = await runCreateCollectionTransaction({
			snapshot: current,
			name: 'fresh',
			...adapters
		});

		expect(result.committed).toBe(false);
		expect(result.failureReason).toBe('config-write-failed');
		expect(result.error).toBe(error);
		expect(result.rollbackFailed).toBe(false);
		expect(result.lifecycleResult).toBeUndefined();
		expect(adapters.calls).toEqual(['before-new', 'update:fresh', 'config:fresh', 'delete:fresh']);
	});

	it('reports rollback failures after config persistence fails', async () => {
		const current = snapshot([{ name: 'default', mods: [] }], 'default');
		const adapters = transactionAdapters();
		adapters.writeConfig.mockRejectedValueOnce(new Error('config write failed'));
		adapters.deleteCollection.mockResolvedValueOnce(false);

		const result = await runCreateCollectionTransaction({
			snapshot: current,
			name: 'fresh',
			...adapters
		});

		expect(result.committed).toBe(false);
		expect(result.failureReason).toBe('config-write-failed');
		expect(result.rollbackFailed).toBe(true);
	});

	it('skips duplicate transactions without an active collection', async () => {
		const adapters = transactionAdapters();

		const result = await runDuplicateCollectionTransaction({
			snapshot: snapshot([], undefined),
			name: 'copy',
			...adapters
		});

		expect(result).toEqual({
			committed: false,
			failureReason: 'missing-active-collection'
		});
		expect(adapters.updateCollection).not.toHaveBeenCalled();
		expect(adapters.writeConfig).not.toHaveBeenCalled();
	});
});
