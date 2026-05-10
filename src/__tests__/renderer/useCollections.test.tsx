import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import type { ElectronApi } from '../../shared/electron-api';
import { useCollections } from '../../renderer/hooks/collections/useCollections';
import { createAppState, createQueryWrapper } from './test-utils';
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
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
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
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
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

	it('preserves untouched collection objects when creating a collection', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:mod-z'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.createCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, { name: 'fresh', mods: [] }, [defaultCollection, archivedCollection, { name: 'fresh', mods: [] }])
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		await waitFor(() => {
			expect(window.electron.createCollectionLifecycle).toHaveBeenCalledWith({
				config: expect.objectContaining({ activeCollection: 'default' }),
				dirtyCollection: undefined,
				name: 'fresh',
				mods: []
			});
		});
		expect(appState.allCollections.get('default')).toEqual(defaultCollection);
		expect(appState.allCollections.get('archived')).toEqual(archivedCollection);
		expect(appState.activeCollection).toEqual({ name: 'fresh', mods: [] });
	});

	it('duplicates the current Active Collection Draft through the lifecycle command module', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const copyCollection = { name: 'copy', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.duplicateCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, copyCollection, [defaultCollection, copyCollection])
		);

		const { result } = renderCollectionsHook(appState);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.duplicateCollection('copy');
		});

		expect(window.electron.duplicateCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			name: 'copy'
		});
		expect(appState.activeCollection).toEqual(copyCollection);
		expect(appState.allCollections.has('copy')).toBe(true);
		expect(result.current.madeEdits).toBe(false);
	});

	it('persists dirty collection edits before switching active collections', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
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

	it('clears dirty draft state after validation persists collection content', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		const { result } = renderCollectionsHook(appState);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.persistCollection(defaultCollection);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ collectionName: 'default', mods: ['local:dirty'] });
		expect(result.current.madeEdits).toBe(false);
	});

	it('keeps dirty draft state and notifies when validation-backed collection persistence fails', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openNotification = vi.fn();
		vi.mocked(window.electron.updateCollection).mockResolvedValueOnce({
			ok: false,
			code: 'write-failed',
			message: 'Failed to save collection default'
		});

		const { result } = renderCollectionsHook(appState, { openNotification });

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.persistCollection(defaultCollection);
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to save collection default',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(result.current.madeEdits).toBe(true);
	});

	it('clears dirty draft state after an explicit pure collection save succeeds', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		const { result } = renderCollectionsHook(appState);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.saveCollection(defaultCollection, true);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ collectionName: 'default', mods: ['local:dirty'] });
		expect(result.current.madeEdits).toBe(false);
	});

	it('publishes collection content save completion events', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const onCollectionContentSaveCompleted = vi.fn();

		const { result } = renderCollectionsHook(appState, { onCollectionContentSaveCompleted });

		await act(async () => {
			await result.current.saveCollection(defaultCollection, true);
		});

		expect(onCollectionContentSaveCompleted).toHaveBeenCalledWith({
			pureSave: true,
			writeAccepted: true
		});
	});

	it('keeps dirty draft state when an explicit collection save fails', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openNotification = vi.fn();
		vi.mocked(window.electron.updateCollection).mockResolvedValueOnce({
			ok: false,
			code: 'write-failed',
			message: 'Failed to save collection default'
		});

		const { result } = renderCollectionsHook(appState, { openNotification });

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.saveCollection(defaultCollection, true);
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to save collection default',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(result.current.madeEdits).toBe(true);
	});

	it('keeps dirty draft state after non-pure collection content persistence succeeds', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		const { result } = renderCollectionsHook(appState);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.saveCollection(defaultCollection, false);
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ collectionName: 'default', mods: ['local:dirty'] });
		expect(result.current.madeEdits).toBe(true);
	});

	it('queues lifecycle commands behind in-flight collection content saves', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const saveDeferred = createDeferred<CollectionContentSaveResult>();
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
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
			saveDeferred.resolve({ ok: true });
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

	it('does not switch active collections when persisting the new selection fails', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.switchCollectionLifecycle).mockResolvedValueOnce(lifecycleFailure('Failed to switch to collection alt'));

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
	});

	it('keeps dirty draft state when a lifecycle command fails to persist bundled draft edits', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:mod-a'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.switchCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Failed to save collection default', 'dirty-collection-write-failed')
		);

		const { result } = renderCollectionsHook(appState);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		expect(window.electron.switchCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: { name: 'default', mods: ['local:dirty'] },
			name: 'alt'
		});
		expect(result.current.madeEdits).toBe(true);
		expect(appState.activeCollection).toEqual(defaultCollection);
	});

	it('does not apply a failed create lifecycle result', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.createCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Created collection fresh but failed to activate it')
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		expect(window.electron.createCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: undefined,
			name: 'fresh',
			mods: []
		});
		expect(appState.allCollections.has('fresh')).toBe(false);
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
	});

	it('does not apply a failed duplicate lifecycle result', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.duplicateCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Failed to duplicate collection default', 'collection-write-failed')
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.duplicateCollection('copy');
		});

		expect(window.electron.duplicateCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: undefined,
			name: 'copy'
		});
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.allCollections.has('copy')).toBe(false);
	});

	it('notifies when creating a collection fails to write the new collection', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
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

	it('applies rename lifecycle state without stale collection names', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const renamedCollection = { name: 'renamed', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.renameCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, renamedCollection, [renamedCollection])
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.renameCollection('renamed');
		});

		expect(window.electron.renameCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: undefined,
			name: 'renamed'
		});
		expect(appState.activeCollection).toEqual(renamedCollection);
		expect(appState.config.activeCollection).toBe('renamed');
		expect(appState.allCollections.has('default')).toBe(false);
		expect(appState.allCollectionNames).toEqual(new Set(['renamed']));
	});

	it('does not apply a failed rename lifecycle result', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		vi.mocked(window.electron.renameCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Renamed collection default but failed to persist the active collection change')
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.renameCollection('renamed');
		});

		expect(window.electron.renameCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: undefined,
			name: 'renamed'
		});
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
		expect(appState.allCollections.has('renamed')).toBe(false);
	});

	it('notifies when renaming a collection is rejected', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openNotification = vi.fn();
		vi.mocked(window.electron.renameCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Failed to rename collection default to renamed')
		);

		const { result } = renderCollectionsHook(appState, { openNotification });

		await act(async () => {
			await result.current.renameCollection('renamed');
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to rename collection default to renamed',
				placement: 'bottomLeft',
				duration: null
			},
			'error'
		);
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.allCollections.has('renamed')).toBe(false);
	});

	it('does not apply a failed delete lifecycle result', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'archived',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: archivedCollection
		});
		vi.mocked(window.electron.deleteCollectionLifecycle).mockResolvedValueOnce(
			lifecycleFailure('Deleted collection archived but failed to persist the replacement selection')
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.deleteCollection();
		});

		expect(window.electron.deleteCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'archived' }),
			dirtyCollection: undefined
		});
		expect(appState.activeCollection).toEqual(archivedCollection);
		expect(appState.config.activeCollection).toBe('archived');
		expect(appState.allCollections.has('archived')).toBe(true);
	});

	it('notifies when deleting a collection is rejected', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'archived',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: archivedCollection
		});
		const openNotification = vi.fn();
		vi.mocked(window.electron.deleteCollectionLifecycle).mockResolvedValueOnce({
			ok: false,
			code: 'collection-delete-failed',
			message: 'Failed to delete collection'
		});

		const { result } = renderCollectionsHook(appState, { openNotification });

		await act(async () => {
			await result.current.deleteCollection();
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to delete collection',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(appState.activeCollection).toEqual(archivedCollection);
		expect(appState.allCollections.has('archived')).toBe(true);
	});

	it('applies delete lifecycle state when another collection remains', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const archivedCollection = { name: 'archived', mods: ['local:dirty'] };
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			allCollections: new Map([
				['default', defaultCollection],
				['archived', archivedCollection]
			]),
			allCollectionNames: new Set(['default', 'archived']),
			activeCollection: defaultCollection
		});

		vi.mocked(window.electron.deleteCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(appState.config, archivedCollection, [archivedCollection])
		);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.deleteCollection();
		});

		expect(window.electron.deleteCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: undefined
		});
		expect(appState.activeCollection).toEqual(archivedCollection);
		expect(appState.config.activeCollection).toBe('archived');
		expect(appState.allCollections.has('default')).toBe(false);
	});
});
