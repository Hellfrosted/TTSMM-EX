import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useCollections } from '../../renderer/hooks/collections/useCollections';
import { createAppState } from './test-utils';

function renderCollectionsHook(appState: ReturnType<typeof createAppState>, overrides: Partial<Parameters<typeof useCollections>[0]> = {}) {
	return renderHook(() =>
		useCollections({
			appState,
			openNotification: vi.fn(),
			cancelValidation: vi.fn(),
			resetValidationState: vi.fn(),
			validateActiveCollection: vi.fn(async () => undefined),
			setModalType: vi.fn(),
			...overrides
		})
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
			expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith({ action: 'create', collection: { name: 'fresh', mods: [] } });
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
			expect(window.electron.saveCollectionContent).toHaveBeenCalledWith({ name: 'default', mods: ['local:dirty'] });
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

		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith({ action: 'create', collection: { name: 'fresh', mods: [] } });
		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith({ action: 'delete', collection: 'fresh' });
		expect(appState.allCollections.has('fresh')).toBe(false);
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
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

		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenNthCalledWith(1, {
			action: 'rename',
			collection: { name: 'default', mods: ['local:dirty'] },
			newName: 'renamed'
		});
		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenNthCalledWith(2, {
			action: 'rename',
			collection: { name: 'renamed', mods: ['local:dirty'] },
			newName: 'default'
		});
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.config.activeCollection).toBe('default');
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

		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith({ action: 'delete', collection: 'archived' });
		expect(window.electron.saveCollectionContent).toHaveBeenCalledWith({ name: 'archived', mods: ['local:dirty'] });
		expect(appState.activeCollection).toEqual(archivedCollection);
		expect(appState.config.activeCollection).toBe('archived');
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

		expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith({ action: 'delete', collection: 'default' });
		expect(appState.activeCollection).toEqual(archivedCollection);
		expect(appState.config.activeCollection).toBe('archived');
		expect(appState.allCollections.has('default')).toBe(false);
	});
});
