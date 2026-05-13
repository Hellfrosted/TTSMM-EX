import { describe, expect, it, vi } from 'vitest';
import { CollectionManagerModalType, type ModCollection, ModType, SessionMods } from '../../model';
import {
	type ActiveCollectionDraftDriverAdapters,
	type ActiveCollectionDraftDriverFacts,
	createActiveCollectionDraftDriver
} from '../../renderer/active-collection-draft-driver';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	type CollectionValidationRunOutcome,
	type CollectionWorkspaceValidationResult,
	createCollectionWorkspaceValidationResult,
	toggleCollectionDraftMod
} from '../../renderer/collection-workspace-session';

const summary = {
	affectedMods: 0,
	missingDependencies: 0,
	incompatibleMods: 0,
	invalidIds: 0,
	subscriptionIssues: 0,
	installIssues: 0,
	updateIssues: 0
};

function collection(mods: string[]): ModCollection {
	return {
		name: 'default',
		mods
	};
}

function validationResult(collection: ModCollection, success = true): CollectionWorkspaceValidationResult {
	const result = createCollectionWorkspaceValidationResult({
		collection,
		config: DEFAULT_CONFIG,
		success,
		summary
	});
	if (!result) {
		throw new Error('Expected validation result');
	}
	return result;
}

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

function createDriverHarness(
	options: {
		draft?: ModCollection;
		facts?: Partial<ActiveCollectionDraftDriverFacts>;
		validateDraft?: ActiveCollectionDraftDriverAdapters['validateDraft'];
	} = {}
) {
	const facts: ActiveCollectionDraftDriverFacts = {
		mods: new SessionMods('', [
			{
				uid: 'local:a',
				type: ModType.LOCAL,
				name: 'Local A'
			},
			{
				uid: 'local:b',
				type: ModType.LOCAL,
				name: 'Local B'
			}
		]),
		...options.facts
	};
	const adapters: ActiveCollectionDraftDriverAdapters = {
		cancelValidation: vi.fn(),
		clearCollectionErrors: vi.fn(),
		clearLaunchState: vi.fn(),
		launchDraft: vi.fn(),
		openModal: vi.fn(),
		persistDraft: vi.fn(),
		recalculateModData: vi.fn(),
		setLaunchingGame: vi.fn((launchingGame) => {
			facts.launchingGame = launchingGame;
		}),
		validateDraft:
			options.validateDraft ??
			vi.fn(async (draft) => ({
				type: 'recorded-current-result',
				validationResult: validationResult(draft ?? collection(['local:a']))
			}))
	};
	const driver = createActiveCollectionDraftDriver({
		initial: {
			config: DEFAULT_CONFIG,
			draft: options.draft
		},
		facts: () => facts,
		adapters
	});

	return { adapters, driver, facts };
}

describe('active-collection-draft-driver', () => {
	it('saves a fresh validated draft before launching', async () => {
		const draft = collection(['local:a']);
		const { adapters, driver } = createDriverHarness({ draft });

		driver.dispatch({
			type: 'validate-requested'
		});
		await flushPromises();
		driver.dispatch({ type: 'launch-requested' });

		expect(adapters.setLaunchingGame).toHaveBeenCalledWith(true);
		expect(adapters.persistDraft).toHaveBeenCalledWith(draft);
		expect(adapters.launchDraft).not.toHaveBeenCalled();

		driver.dispatch({
			type: 'collection-content-save-completed',
			completion: {
				pureSave: true,
				savedCollection: draft,
				writeAccepted: true
			}
		});

		expect(adapters.launchDraft).toHaveBeenCalledOnce();
	});

	it('validates an edited draft through the driver before launch', async () => {
		const originalDraft = collection(['local:a']);
		const editedDraft = collection(['local:a', 'local:b']);
		const validateDraft = vi.fn(
			async (): Promise<CollectionValidationRunOutcome> => ({
				type: 'recorded-current-result',
				validationResult: validationResult(editedDraft)
			})
		);
		const { adapters, driver } = createDriverHarness({ draft: originalDraft, validateDraft });

		driver.dispatch({
			type: 'active-draft-edited',
			edit: toggleCollectionDraftMod({
				checked: true,
				collection: originalDraft,
				modManagerUid: 'workshop:1',
				uid: 'local:b'
			})
		});
		await flushPromises();
		driver.dispatch({ type: 'launch-requested' });

		expect(validateDraft).toHaveBeenCalledWith(editedDraft, false, undefined);
		expect(adapters.persistDraft).toHaveBeenCalledWith(editedDraft);
	});

	it('opens validation errors and clears launching when launch-triggered validation fails', async () => {
		const draft = collection(['local:a']);
		const validateDraft = vi.fn(
			async (): Promise<CollectionValidationRunOutcome> => ({
				type: 'recorded-failed-result',
				modalType: CollectionManagerModalType.ERRORS_FOUND,
				validationResult: validationResult(draft, false)
			})
		);
		const { adapters, driver } = createDriverHarness({ draft, validateDraft });

		driver.dispatch({ type: 'launch-requested' });
		await flushPromises();

		expect(adapters.openModal).toHaveBeenCalledWith(CollectionManagerModalType.ERRORS_FOUND);
		expect(adapters.clearLaunchState).toHaveBeenCalled();
		expect(adapters.persistDraft).not.toHaveBeenCalled();
	});

	it('ignores an earlier validation when a later validation completes first', async () => {
		const firstDraft = collection(['local:a']);
		const secondDraft = collection(['local:a', 'local:b']);
		const completions: Array<(outcome: CollectionValidationRunOutcome) => void> = [];
		const validateDraft = vi.fn(
			() =>
				new Promise<CollectionValidationRunOutcome>((resolve) => {
					completions.push(resolve);
				})
		);
		const { driver } = createDriverHarness({ draft: firstDraft, validateDraft });

		driver.dispatch({ type: 'validate-requested' });
		driver.dispatch({
			type: 'active-draft-edited',
			edit: toggleCollectionDraftMod({
				checked: true,
				collection: firstDraft,
				modManagerUid: 'workshop:1',
				uid: 'local:b'
			})
		});

		completions[1]?.({
			type: 'recorded-current-result',
			validationResult: validationResult(secondDraft)
		});
		await flushPromises();
		completions[0]?.({
			type: 'recorded-current-result',
			validationResult: validationResult(firstDraft)
		});
		await flushPromises();

		expect(validateDraft).toHaveBeenNthCalledWith(1, firstDraft, false, undefined);
		expect(validateDraft).toHaveBeenNthCalledWith(2, secondDraft, false, undefined);
		expect(driver.getSnapshot().draft).toEqual(secondDraft);
		expect(driver.getSnapshot().validationResult).toEqual(validationResult(secondDraft));
	});

	it('preserves dirty draft on ordinary authoritative refresh and replaces it on lifecycle result', () => {
		const originalDraft = collection(['local:a']);
		const editedDraft = collection(['local:a', 'local:b']);
		const authoritativeRefresh = collection(['remote:a']);
		const lifecycleCollection = collection(['accepted:a']);
		const { driver } = createDriverHarness({ draft: originalDraft });

		driver.dispatch({
			type: 'active-draft-edited',
			edit: toggleCollectionDraftMod({
				checked: true,
				collection: originalDraft,
				modManagerUid: 'workshop:1',
				uid: 'local:b'
			})
		});
		driver.dispatch({ type: 'active-draft-changed', config: DEFAULT_CONFIG, currentDraft: authoritativeRefresh });

		expect(driver.getSnapshot().draft).toEqual(editedDraft);
		expect(driver.getSnapshot().hasUnsavedDraft).toBe(true);

		driver.dispatch({ type: 'collection-lifecycle-result-applied', config: DEFAULT_CONFIG, currentDraft: lifecycleCollection });

		expect(driver.getSnapshot().draft).toEqual(lifecycleCollection);
		expect(driver.getSnapshot().hasUnsavedDraft).toBe(false);
	});

	it('cancels validation and ignores late completion after dispose', async () => {
		const draft = collection(['local:a']);
		let completeValidation: ((outcome: CollectionValidationRunOutcome) => void) | undefined;
		const validateDraft = vi.fn(
			() =>
				new Promise<CollectionValidationRunOutcome>((resolve) => {
					completeValidation = resolve;
				})
		);
		const { adapters, driver } = createDriverHarness({ draft, validateDraft });

		driver.dispatch({ type: 'validate-requested' });
		driver.dispose();
		completeValidation?.({
			type: 'recorded-current-result',
			validationResult: validationResult(draft)
		});
		await flushPromises();

		expect(adapters.cancelValidation).toHaveBeenCalled();
		expect(driver.getSnapshot().validationStatus).toBe('validating');
	});

	it('clears validating state when validation has no Active Collection Draft', async () => {
		const validateDraft = vi.fn(async (): Promise<CollectionValidationRunOutcome> => ({ type: 'missing-active-collection' }));
		const { driver } = createDriverHarness({ validateDraft });

		driver.dispatch({ type: 'validate-requested' });
		expect(driver.getSnapshot().validationStatus).toBe('validating');
		await flushPromises();

		expect(driver.getSnapshot().validationStatus).toBe('none');
	});

	it('clears validating state when the validation adapter rejects', async () => {
		const validateDraft = vi.fn(async (): Promise<CollectionValidationRunOutcome> => {
			throw new Error('validation adapter failed');
		});
		const { driver } = createDriverHarness({ draft: collection(['local:a']), validateDraft });

		driver.dispatch({ type: 'validate-requested' });
		expect(driver.getSnapshot().validationStatus).toBe('validating');
		await flushPromises();

		expect(driver.getSnapshot().validationStatus).toBe('none');
	});
});
