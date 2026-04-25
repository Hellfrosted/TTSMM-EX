import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useCollections } from '../../renderer/hooks/collections/useCollections';
import { createAppState } from './test-utils';

function renderCollectionsHook(appState: ReturnType<typeof createAppState>, overrides: Partial<Parameters<typeof useCollections>[0]> = {}) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: Infinity,
				retry: false
			}
		}
	});

	function QueryWrapper({ children }: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	}

	return renderHook(
		() =>
			useCollections({
				appState,
				openNotification: vi.fn(),
				cancelValidation: vi.fn(),
				resetValidationState: vi.fn(),
				validateActiveCollection: vi.fn(async () => undefined),
				setModalType: vi.fn(),
				...overrides
			}),
		{ wrapper: QueryWrapper }
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

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'alt' }));
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
		const cancelValidation = vi.fn();
		const validateActiveCollection = vi.fn(async () => undefined);

		const { result, rerender } = renderCollectionsHook(appState, {
			cancelValidation,
			validateActiveCollection
		});

		act(() => {
			result.current.setEnabledMods(new Set(['local:mod-a']));
		});
		rerender();

		await waitFor(() => {
			expect(validateActiveCollection).toHaveBeenCalledWith(false);
		});
		expect(cancelValidation).toHaveBeenCalled();
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

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		await waitFor(() => {
			expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'fresh', mods: [] });
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'fresh' }));
		});
		expect(appState.allCollections.get('default')).toBe(defaultCollection);
		expect(appState.allCollections.get('archived')).toBe(archivedCollection);
		expect(appState.activeCollection).toEqual({ name: 'fresh', mods: [] });
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
			expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'default', mods: ['local:dirty'] });
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'alt' }));
		});
		expect(resetValidationState).toHaveBeenCalled();
		expect(result.current.madeEdits).toBe(false);
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
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.changeActiveCollection('alt');
		});

		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
	});

	it('rolls back a new collection when activating it fails to persist', async () => {
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
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'fresh', mods: [] });
		expect(window.electron.deleteCollection).toHaveBeenCalledWith('fresh');
		expect(appState.allCollections.has('fresh')).toBe(false);
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
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
		vi.mocked(window.electron.updateCollection).mockResolvedValueOnce(false);

		const { result } = renderCollectionsHook(appState, { openNotification });

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to create new collection fresh',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(appState.allCollections.has('fresh')).toBe(false);
	});

	it('rolls back a rename when the active collection config update fails', async () => {
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
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.renameCollection('renamed');
		});

		expect(window.electron.renameCollection).toHaveBeenNthCalledWith(1, { name: 'default', mods: ['local:dirty'] }, 'renamed');
		expect(window.electron.renameCollection).toHaveBeenNthCalledWith(2, { name: 'renamed', mods: ['local:dirty'] }, 'default');
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
		vi.mocked(window.electron.renameCollection).mockResolvedValueOnce(false);

		const { result } = renderCollectionsHook(appState, { openNotification });

		await act(async () => {
			await result.current.renameCollection('renamed');
		});

		expect(openNotification).toHaveBeenCalledWith(
			{
				message: 'Failed to rename collection default to renamed',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.allCollections.has('renamed')).toBe(false);
	});

	it('restores a deleted collection when selecting the replacement fails to persist', async () => {
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
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.deleteCollection();
		});

		expect(window.electron.deleteCollection).toHaveBeenCalledWith('archived');
		expect(window.electron.updateCollection).toHaveBeenCalledWith({ name: 'archived', mods: ['local:dirty'] });
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
		vi.mocked(window.electron.deleteCollection).mockResolvedValueOnce(false);

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

	it('deletes the default collection from disk when another collection remains', async () => {
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

		const { result } = renderCollectionsHook(appState);

		await act(async () => {
			await result.current.deleteCollection();
		});

		expect(window.electron.deleteCollection).toHaveBeenCalledWith('default');
		expect(appState.activeCollection).toEqual(archivedCollection);
		expect(appState.config.activeCollection).toBe('archived');
		expect(appState.allCollections.has('default')).toBe(false);
	});
});
