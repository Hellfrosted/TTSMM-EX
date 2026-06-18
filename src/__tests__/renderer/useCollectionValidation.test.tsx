import { act, renderHook, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDependencies, getModDescriptorKey, ModErrorType, ModType, SessionMods, setupDescriptors } from '../../model';
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

type TestAppState = ReturnType<typeof createAppState>;
type ValidationOptions = Parameters<typeof useCollectionValidation>[0];
type WorkspaceValidationStatus = ReturnType<typeof createCollectionWorkspaceSession>['validationStatus'];

function renderValidationHook(appState: TestAppState, options: Partial<ValidationOptions> = {}) {
	return renderHook(() =>
		useCollectionValidation({
			appState,
			openNotification: vi.fn(),
			setModalType: vi.fn(),
			persistCollection: vi.fn(async () => true),
			...options
		})
	);
}

function expectWorkspaceValidationStatus(
	appState: TestAppState,
	validationResult: ReturnType<typeof useCollectionValidation>['validationResult'],
	expectedStatus: WorkspaceValidationStatus,
	config = appState.config
) {
	expect(
		createCollectionWorkspaceSession({
			activeCollection: appState.activeCollection,
			config,
			hasUnsavedDraft: false,
			validationResult
		}).validationStatus
	).toBe(expectedStatus);
}

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

		const { result, rerender } = renderValidationHook(appState);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'passed');

		act(() => {
			appState.activeCollection = { name: 'alt', mods: ['local:b'] };
		});
		rerender();

		expect(result.current.lastValidationStatus).toBe(true);
		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'stale');
	});

	it('treats a validated empty collection as current', async () => {
		const mods = new SessionMods('', []);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: [] }
		});

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderValidationHook(appState);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expect(result.current.lastValidationStatus).toBe(true);
		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'passed');
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

		const { result, rerender } = renderValidationHook(appState);

		await act(async () => {
			await result.current.validateActiveCollection(false);
		});

		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'passed');

		act(() => {
			appState.config = {
				...appState.config,
				userOverrides: new Map([[mod.uid, { id: 'CoreModOverride' }]])
			};
		});
		rerender();

		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'stale');
	});

	it('records launch-triggered validation without persisting the validated collection', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const persistCollection = vi.fn(async () => false);

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderValidationHook(appState, { persistCollection });

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			outcome = await result.current.validateActiveCollection(true);
		});

		if (outcome?.type !== 'recorded-current-result') {
			throw new Error(`Expected recorded-current-result validation outcome, received ${outcome?.type}`);
		}
		expect(persistCollection).not.toHaveBeenCalled();
		expect(outcome.validationResult.success).toBe(true);
		expect(result.current.lastValidationStatus).toBe(true);
		expect(result.current.validationResult).toEqual(outcome.validationResult);
	});

	it('returns a recorded validation result after successful launch-triggered validation', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const persistCollection = vi.fn(async () => true);

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderValidationHook(appState, { persistCollection });

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			outcome = await result.current.validateActiveCollection(true);
		});

		if (outcome?.type !== 'recorded-current-result') {
			throw new Error(`Expected recorded-current-result validation outcome, received ${outcome?.type}`);
		}
		expect(persistCollection).not.toHaveBeenCalled();
		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'passed');
	});

	it('validates the supplied Active Collection Draft instead of app state activeCollection', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const persistCollection = vi.fn(async () => true);

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderValidationHook(appState, {
			activeCollectionDraft: { name: 'default', mods: ['local:b'] },
			persistCollection
		});

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			outcome = await result.current.validateActiveCollection(true);
		});

		if (outcome?.type !== 'recorded-current-result') {
			throw new Error(`Expected recorded-current-result validation outcome, received ${outcome?.type}`);
		}
		expect(persistCollection).not.toHaveBeenCalled();
		expect(outcome.validationResult.draftKey).toContain('local:b');
		expect(result.current.validationResult).toEqual(outcome.validationResult);
	});

	it('records validation for an explicitly supplied draft before the hook rerenders with that draft', async () => {
		const modA = { uid: 'local:a', id: 'ModA', name: 'Mod A', type: ModType.LOCAL };
		const modB = { uid: 'local:b', id: 'ModB', name: 'Mod B', type: ModType.LOCAL };
		const mods = new SessionMods('', [modA, modB]);
		const appState = createAppState({
			config: createTestConfig({ activeCollection: 'default' }),
			mods,
			activeCollection: { name: 'default', mods: ['local:a'] }
		});
		const editedDraft = { name: 'default', mods: ['local:b'] };

		setupDescriptors(mods, appState.config.userOverrides);

		const { result } = renderValidationHook(appState, { activeCollectionDraft: appState.activeCollection });

		let outcome: Awaited<ReturnType<typeof result.current.validateActiveCollection>> | undefined;
		await act(async () => {
			outcome = await result.current.validateActiveCollection(false, { collection: editedDraft });
		});

		if (outcome?.type !== 'recorded-current-result') {
			throw new Error(`Expected recorded-current-result validation outcome, received ${outcome?.type}`);
		}
		expect(outcome.validationResult.draftKey).toContain('local:b');
		expect(result.current.validationResult).toEqual(outcome.validationResult);
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

		const { result } = renderValidationHook(appState);
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
		expectWorkspaceValidationStatus(appState, result.current.validationResult, 'passed', nextConfig);
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

		const { result } = renderValidationHook(appState);

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
