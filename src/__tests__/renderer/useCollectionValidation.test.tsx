import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModErrorType, ModType, SessionMods, getModDescriptorKey, setupDescriptors } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useCollectionValidation } from '../../renderer/hooks/collections/useCollectionValidation';
import { createAppState } from './test-utils';

describe('useCollectionValidation', () => {
	it('does not treat a previous validation result as current after switching collections', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true),
				launchMods: vi.fn(async () => undefined)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(true);

		act(() => {
			appState.activeCollection = { name: 'alt', mods: ['local:b'] };
		});
		rerender();

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(false);
	});

	it('treats a validated empty collection as current', async () => {
		const mods = new SessionMods('', []);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: [] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true),
				launchMods: vi.fn(async () => undefined)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(true);
	});

	it('does not treat validation as current after config changes that affect descriptor equivalence', async () => {
		const mods = new SessionMods('', []);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map(),
				treatNuterraSteamBetaAsEquivalent: true
			},
			mods,
			activeCollection: { name: 'default', mods: [] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true),
				launchMods: vi.fn(async () => undefined)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(true);

		act(() => {
			appState.config = {
				...appState.config,
				treatNuterraSteamBetaAsEquivalent: false
			};
		});
		rerender();

		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(false);
	});

	it('does not mark validation current or launch when persisting the validated collection fails', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const persistCollection = vi.fn(async () => false);
		const launchMods = vi.fn(async () => undefined);

		setupDescriptors(mods, appState.config.userOverrides, appState.config);

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection,
				launchMods
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(true);
		});

		expect(persistCollection).toHaveBeenCalledWith(appState.activeCollection);
		expect(launchMods).not.toHaveBeenCalled();
		expect(result.current.lastValidationStatus).toBeUndefined();
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(false);
	});

	it('applies ignored validation errors from a supplied config override', async () => {
		const currentMod = {
			uid: 'local:core',
			id: 'CoreMod',
			name: 'Core Mod',
			type: ModType.LOCAL,
			steamDependencies: [BigInt(11)]
		};
		const dependencyMod = {
			uid: 'workshop:11',
			id: 'DependencyMod',
			name: 'Dependency Mod',
			type: ModType.WORKSHOP,
			workshopID: BigInt(11),
			subscribed: true,
			installed: true
		};
		const mods = new SessionMods('', [currentMod, dependencyMod]);
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/collections/main',
				activeCollection: 'default',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			mods,
			activeCollection: { name: 'default', mods: [currentMod.uid] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const ignoredDependencyDescriptor = mods.foundMods[0].dependsOn?.[0];
		if (!ignoredDependencyDescriptor) {
			throw new Error('Expected a dependency descriptor for the validation override test');
		}
		const ignoredDependencyKey = getModDescriptorKey(ignoredDependencyDescriptor);
		if (!ignoredDependencyKey) {
			throw new Error('Expected a dependency key for the validation override test');
		}

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true),
				launchMods: vi.fn(async () => undefined)
			})
		);
		const nextConfig = {
			...appState.config,
			ignoredValidationErrors: new Map([
				[
					ModErrorType.MISSING_DEPENDENCIES,
					{
						[currentMod.uid]: [ignoredDependencyKey]
					}
				]
			])
		};

		await act(async () => {
			appState.config = nextConfig;
			await result.current.validateActiveCollection(false, { config: nextConfig });
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(appState.mods.modIdToModDataMap.get(currentMod.uid)?.errors?.missingDependencies).toBeUndefined();
		expect(result.current.isValidationCurrentForCollection(appState.activeCollection)).toBe(true);
	});
});
