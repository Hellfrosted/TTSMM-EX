import { act, renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModErrorType, ModType, SessionMods, getDependencies, getModDescriptorKey, setupDescriptors } from '../../model';
import { createCollectionWorkspaceSession } from '../../renderer/collection-workspace-session';
import { useCollectionValidation } from '../../renderer/hooks/collections/useCollectionValidation';
import { createAppState, createTestConfig } from './test-utils';

const validateCollectionMock = vi.hoisted(() => vi.fn());

vi.mock('model', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../model')>();
	validateCollectionMock.mockImplementation(actual.validateCollection);
	return {
		...actual,
		validateCollection: validateCollectionMock
	};
});

describe('useCollectionValidation', () => {
	beforeEach(async () => {
		const actual = await vi.importActual<typeof import('../../model')>('model');
		validateCollectionMock.mockReset();
		validateCollectionMock.mockImplementation(actual.validateCollection);
	});

	it('does not treat a previous validation result as current after switching collections', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});

		setupDescriptors(mods, appState.config.userOverrides);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: appState.config,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('passed');

		act(() => {
			appState.activeCollection = { name: 'alt', mods: ['local:b'] };
		});
		rerender();

		expect(result.current.lastValidationStatus).toBe(true);
		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: appState.config,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('stale');
	});

	it('treats a validated empty collection as current', async () => {
		const mods = new SessionMods('', []);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: [] }
		});

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: appState.config,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('passed');
	});

	it('does not treat validation as current after config changes that affect descriptor resolution', async () => {
		const mod = { uid: 'local:a', id: 'CoreMod', name: 'Core Mod', type: ModType.LOCAL };
		const mods = new SessionMods('', [mod]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: [mod.uid] }
		});

		setupDescriptors(mods, appState.config.userOverrides);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true)
			})
		);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: appState.config,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('passed');

		act(() => {
			appState.config = {
				...appState.config,
				userOverrides: new Map([[mod.uid, { id: 'CoreModOverride' }]])
			};
		});
		rerender();

		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: appState.config,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('stale');
	});

	it('does not mark validation current or launch when persisting the validated collection fails', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const persistCollection = vi.fn(async () => false);

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection
			})
		);

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			outcome = await result.current.validateActiveCollection(true);
		});

		if (outcome?.type !== 'persistence-failed') {
			throw new Error(`Expected persistence-failed validation outcome, received ${outcome?.type}`);
		}
		expect(persistCollection).toHaveBeenCalledWith(appState.activeCollection);
		expect(outcome.validationResult.success).toBe(true);
		expect(result.current.lastValidationStatus).toBeUndefined();
		expect(result.current.validationResult).toBeUndefined();
	});

	it('returns a launch continuation after successful validation only when the validated draft is still current', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const persistCollection = vi.fn(async () => true);

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection
			})
		);

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			outcome = await result.current.validateActiveCollection(true);
		});

		if (outcome?.type !== 'recorded-and-ready-to-launch-current-draft') {
			throw new Error(`Expected recorded-and-ready-to-launch-current-draft validation outcome, received ${outcome?.type}`);
		}
		expect(persistCollection).toHaveBeenCalledWith(appState.activeCollection);
		expect(outcome.launchCollection).toEqual(appState.activeCollection);
		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: appState.config,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('passed');
	});

	it('does not return a launch continuation when the validated draft becomes stale before persistence completes', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		let resolvePersist: (saved: boolean) => void = () => undefined;
		const persistCollection = vi.fn(
			() =>
				new Promise<boolean>((resolve) => {
					resolvePersist = resolve;
				})
		);

		setupDescriptors(mods, appState.config.userOverrides);

		const { result, rerender } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection
			})
		);

		let validationPromise: ReturnType<typeof result.current.validateActiveCollection> | undefined;
		act(() => {
			validationPromise = result.current.validateActiveCollection(true);
		});

		await waitFor(() => {
			expect(persistCollection).toHaveBeenCalledWith({ name: 'default', mods: ['local:a'] });
		});

		act(() => {
			appState.activeCollection = { name: 'default', mods: ['local:b'] };
		});
		rerender();

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			resolvePersist(true);
			outcome = await validationPromise;
		});

		if (outcome?.type !== 'discarded-stale-result') {
			throw new Error(`Expected discarded-stale-result validation outcome, received ${outcome?.type}`);
		}
		expect(result.current.validationResult).toBeUndefined();
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
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: [currentMod.uid] }
		});

		setupDescriptors(mods, appState.config.userOverrides);
		const ignoredDependencyDescriptor = getDependencies(mods, mods.foundMods[0])[0];
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
				persistCollection: vi.fn(async () => true)
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
		expect(
			createCollectionWorkspaceSession({
				activeCollection: appState.activeCollection,
				config: nextConfig,
				hasUnsavedDraft: false,
				validationResult: result.current.validationResult
			}).validationStatus
		).toBe('passed');
	});

	it('interrupts an in-flight validation Effect before starting the next validation', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		let firstValidationAborted = false;

		setupDescriptors(mods, appState.config.userOverrides);
		validateCollectionMock
			.mockImplementationOnce(() =>
				Effect.tryPromise({
					try: (signal) =>
						new Promise<Record<string, never>>((resolve) => {
							signal.addEventListener('abort', () => {
								firstValidationAborted = true;
								resolve({});
							});
						}),
					catch: (error) => error
				})
			)
			.mockImplementationOnce(() => Effect.succeed({}));

		const { result } = renderHook(() =>
			useCollectionValidation({
				appState,
				openNotification: vi.fn(),
				setModalType: vi.fn(),
				persistCollection: vi.fn(async () => true)
			})
		);

		act(() => {
			void result.current.validateActiveCollection(false);
		});
		await waitFor(() => {
			expect(validateCollectionMock).toHaveBeenCalledTimes(1);
		});

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(firstValidationAborted).toBe(true);
		expect(result.current.lastValidationStatus).toBe(true);
	});
});
