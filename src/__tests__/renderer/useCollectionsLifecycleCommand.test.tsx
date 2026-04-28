import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useCollections } from '../../renderer/hooks/collections/useCollections';
import { createAppState } from './test-utils';

function renderCollectionsHook(appState: ReturnType<typeof createAppState>, openNotification = vi.fn()) {
	return renderHook(() =>
		useCollections({
			appState,
			openNotification,
			cancelValidation: vi.fn(),
			resetValidationState: vi.fn(),
			validateActiveCollection: vi.fn(async () => undefined),
			setModalType: vi.fn()
		})
	);
}

describe('useCollections lifecycle command sequencing', () => {
	it('saves dirty active collection content before creating a new collection through lifecycle commands', async () => {
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
			await result.current.createNewCollection('fresh', ['local:new']);
		});

		await waitFor(() => {
			expect(window.electron.saveCollectionContent).toHaveBeenCalledWith(defaultCollection);
			expect(window.electron.executeCollectionLifecycleCommand).toHaveBeenCalledWith({
				action: 'create',
				collection: { name: 'fresh', mods: ['local:new'] }
			});
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ activeCollection: 'fresh' }));
		});
		expect(vi.mocked(window.electron.saveCollectionContent).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(window.electron.executeCollectionLifecycleCommand).mock.invocationCallOrder[0]
		);
		expect(appState.activeCollection).toEqual({ name: 'fresh', mods: ['local:new'] });
		expect(appState.config.activeCollection).toBe('fresh');
	});

	it('does not send a lifecycle create command when persisting dirty active content fails first', async () => {
		const openNotification = vi.fn();
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
		vi.mocked(window.electron.saveCollectionContent).mockResolvedValueOnce(false);
		const { result } = renderCollectionsHook(appState, openNotification);

		act(() => {
			result.current.setMadeEdits(true);
		});

		await act(async () => {
			await result.current.createNewCollection('fresh');
		});

		expect(window.electron.saveCollectionContent).toHaveBeenCalledWith(defaultCollection);
		expect(window.electron.executeCollectionLifecycleCommand).not.toHaveBeenCalled();
		expect(window.electron.updateConfig).not.toHaveBeenCalled();
		expect(appState.activeCollection).toEqual(defaultCollection);
		expect(appState.allCollections.has('fresh')).toBe(false);
		expect(openNotification).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to save collection default' }), 'error');
	});
});
