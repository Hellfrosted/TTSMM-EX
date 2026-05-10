import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import type { ElectronApi } from '../../shared/electron-api';
import { useCollections } from '../../renderer/hooks/collections/useCollections';
import { createAppState, createQueryWrapper, createTestConfig } from './test-utils';
import { cloneCollection, type AppConfig, type ModCollection } from '../../model';
import type { CollectionLifecycleFailureCode } from '../../shared/collection-lifecycle';
import type { CollectionContentSaveResult } from '../../shared/collection-content-save';

declare global {
	interface Window {
		electron: ElectronApi;
	}
}

function lifecycleSuccess(config: AppConfig, activeCollection: ModCollection, collections: ModCollection[]) {
	return {
		ok: true,
		activeCollection: cloneCollection(activeCollection),
		collections: collections.map(cloneCollection),
		collectionNames: collections.map((collection) => collection.name),
		config: {
			...config,
			activeCollection: activeCollection.name
		}
	} as const;
}

function lifecycleFailure(message: string, code: CollectionLifecycleFailureCode = 'config-write-failed') {
	return {
		ok: false,
		code,
		message
	} as const;
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

function renderCollectionsHook(appState: ReturnType<typeof createAppState>, overrides: Partial<Parameters<typeof useCollections>[0]> = {}) {
	return renderHook(
		() =>
			useCollections({
				appState,
				openNotification: vi.fn(),
				resetValidationState: vi.fn(),
				onDraftEditWorkflow: vi.fn(),
				...overrides
			}),
		{ wrapper: createQueryWrapper() }
	);
}

describe('useCollections', () => {
	it('switches active collections immutably and persists the selected collection name', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.switchCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, altCollection, [defaultCollection, altCollection])
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		await waitFor(() => {
			expect(window.electron.switchCollectionLifecycle).toHaveBeenCalledWith({
				config: expect.objectContaining({ activeCollection: 'default' }),
				dirtyCollection: undefined,
				name: 'alt'
			});
		});
		expect(appState.activeCollection).toEqual(altCollection);
		expect(appState.activeCollection).not.toBe(altCollection);
		expect(appState.config.activeCollection).toBe('alt');
	});

	it('keeps the mod manager enabled when bulk-updating a collection selection', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:mod-z'] };
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: defaultCollection
		});
		const onDraftEditWorkflow = vi.fn();

		const { result, rerender } = renderCollectionsHook(appState, {
			onDraftEditWorkflow
		});

		act(() => {
			result.current.setEnabledMods(new Set(['local:mod-a']));
		});
		rerender();

		await waitFor(() => {
			expect(onDraftEditWorkflow).toHaveBeenCalledWith(
				expect.objectContaining({
					pendingValidationDraft: {
						name: 'default',
						mods: [`local:mod-a`, `workshop:${DEFAULT_CONFIG.workshopID}`]
					}
				})
			);
		});
		expect(appState.activeCollection?.mods).toEqual([`local:mod-a`, `workshop:${DEFAULT_CONFIG.workshopID}`]);
		expect(appState.allCollections.get('archived')).toBe(archivedCollection);
		expect(result.current.madeEdits).toBe(true);
	});

	it('persists dirty collection edits before switching active collections', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});
		const resetValidationState = vi.fn();
		vi.mocked(window.electron.switchCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, altCollection, [defaultCollection, altCollection])
		);

		const { result } = renderCollectionsHook(appState, {
			resetValidationState
		});

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		await waitFor(() => {
			expect(window.electron.switchCollectionLifecycle).toHaveBeenCalledWith({
				config: expect.objectContaining({ activeCollection: 'default' }),
				dirtyCollection: { name: 'default', mods: ['local:dirty'] },
				name: 'alt'
			});
		});
		expect(resetValidationState).toHaveBeenCalled();
		expect(result.current.madeEdits).toBe(false);
		expect(appState.activeCollection).toEqual(altCollection);
	});

	it('queues lifecycle commands behind in-flight collection content saves', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const saveDeferred = createDeferred<CollectionContentSaveResult>();
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.updateCollection).mockReturnValueOnce(saveDeferred.promise);
		vi.mocked(window.electron.switchCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, altCollection, [defaultCollection, altCollection])
		);

		const { result } = renderCollectionsHook(appState);
		let savePromise!: Promise<boolean>;
		let switchPromise!: Promise<void>;

		await act(async () => {
			savePromise = result.current.saveCollection(defaultCollection, true);
			switchPromise = result.current.changeActiveCollection('alt');
		});

		await waitFor(() => {
			expect(window.electron.updateCollection).toHaveBeenCalledTimes(1);
		});
		expect(window.electron.switchCollectionLifecycle).not.toHaveBeenCalled();

		await act(async () => {
			saveDeferred.resolve({ ok: true, collection: cloneCollection(defaultCollection) });
			await savePromise;
			await switchPromise;
		});

		expect(window.electron.switchCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: undefined,
			name: 'alt'
		});
		expect(appState.activeCollection).toEqual(altCollection);
	});

	it('notifies when creating a collection fails to write the new collection', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openNotification = vi.fn();
		vi.mocked(window.electron.createCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Failed to create collection fresh', 'collection-write-failed')
		);

		const { result } = renderCollectionsHook(appState, { openNotification });

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to create collection fresh',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(appState.allCollections.has('fresh')).toBe(false);
	});
});
