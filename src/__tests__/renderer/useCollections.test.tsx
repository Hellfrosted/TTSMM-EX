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
});
