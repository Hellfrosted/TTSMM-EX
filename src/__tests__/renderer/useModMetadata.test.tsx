import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useModMetadata } from '../../renderer/hooks/collections/useModMetadata';
import { createAppState } from './test-utils';

describe('useModMetadata', () => {
	it('triggers downstream refreshes for dependency-only metadata updates', async () => {
		const mod = {
			uid: 'workshop:1',
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'DependencyCarrier',
			name: 'Dependency Carrier'
		};
		const mods = new SessionMods('', [mod]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: [mod.uid] }
		});
		setupDescriptors(mods, appState.config.userOverrides);

		const onMetadataUpdate = vi.fn();
		renderHook(() => useModMetadata(appState, onMetadataUpdate));

		const metadataCallback = vi.mocked(window.electron.onModMetadataUpdate).mock.calls[0]?.[0];
		expect(metadataCallback).toBeTypeOf('function');

		act(() => {
			metadataCallback?.(mod.uid, {
				steamDependencies: [BigInt(2)],
				steamDependencyNames: {
					'2': 'Dependency Two'
				}
			});
		});

		await waitFor(() => {
			expect(onMetadataUpdate).toHaveBeenCalledTimes(1);
		});

		const [updatedMod] = appState.mods.foundMods;
		expect(updatedMod?.steamDependencies).toEqual([BigInt(2)]);
		expect(updatedMod?.steamDependencyNames).toEqual({ '2': 'Dependency Two' });
	});

	it('applies unknown dependency metadata by clearing previously known dependencies', async () => {
		const mod = {
			uid: 'workshop:1',
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'DependencyCarrier',
			name: 'Dependency Carrier',
			steamDependencies: [BigInt(2)],
			steamDependencyNames: {
				'2': 'Dependency Two'
			},
			steamDependenciesFetchedAt: 1666666666666
		};
		const mods = new SessionMods('', [mod]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: [mod.uid] }
		});
		setupDescriptors(mods, appState.config.userOverrides);

		const onMetadataUpdate = vi.fn();
		renderHook(() => useModMetadata(appState, onMetadataUpdate));

		const metadataCallback = vi.mocked(window.electron.onModMetadataUpdate).mock.calls[0]?.[0];
		expect(metadataCallback).toBeTypeOf('function');

		act(() => {
			metadataCallback?.(mod.uid, {
				steamDependencies: undefined,
				steamDependencyNames: undefined,
				steamDependenciesFetchedAt: 1777777777777
			});
		});

		await waitFor(() => {
			expect(onMetadataUpdate).toHaveBeenCalledTimes(1);
		});

		const [updatedMod] = appState.mods.foundMods;
		expect(updatedMod?.steamDependencies).toBeUndefined();
		expect(updatedMod?.steamDependencyNames).toBeUndefined();
		expect(updatedMod?.steamDependenciesFetchedAt).toBe(1777777777777);
	});
});
