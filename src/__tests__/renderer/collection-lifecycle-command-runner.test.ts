import { describe, expect, it, vi } from 'vitest';
import { cloneCollection, type AppConfig, type ModCollection } from '../../model';
import type { AppStateUpdate } from '../../model/AppState';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	createCollectionLifecycleCommandRunner,
	getCollectionLifecycleFailureNotification,
	getCollectionLifecycleStateUpdate,
	getCollectionLifecycleSuccessNotification
} from '../../renderer/collection-lifecycle-command-runner';

type CollectionLifecycleClient = Parameters<typeof createCollectionLifecycleCommandRunner>[0]['client'];
type CollectionLifecycleStateSnapshot = ReturnType<Parameters<typeof createCollectionLifecycleCommandRunner>[0]['getState']>;

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

function createClient(): CollectionLifecycleClient {
	return {
		createCollectionLifecycle: vi.fn(),
		deleteCollectionLifecycle: vi.fn(),
		duplicateCollectionLifecycle: vi.fn(),
		renameCollectionLifecycle: vi.fn(),
		switchCollectionLifecycle: vi.fn()
	};
}

function createRunnerHarness(input: {
	applyLifecycleResult?: Parameters<typeof createCollectionLifecycleCommandRunner>[0]['applyLifecycleResult'];
	client?: CollectionLifecycleClient;
	onLifecycleResultApplied?: Parameters<typeof createCollectionLifecycleCommandRunner>[0]['onLifecycleResultApplied'];
	state?: CollectionLifecycleStateSnapshot;
	updateState?: (state: AppStateUpdate) => void;
}) {
	let state: CollectionLifecycleStateSnapshot = input.state ?? {
		activeCollection: { name: 'default', mods: [] },
		config: {
			...DEFAULT_CONFIG,
			activeCollection: 'default'
		},
		hasUnsavedDraft: false
	};
	const client = input.client ?? createClient();
	const updateState = vi.fn((nextState: AppStateUpdate) => {
		state = {
			...state,
			activeCollection: nextState.activeCollection ?? state.activeCollection,
			config: nextState.config ?? state.config
		};
		input.updateState?.(nextState);
	});
	const runQueuedCollectionWriteImpl = async <T>(operation: () => Promise<T>): Promise<T> => operation();
	const runQueuedCollectionWrite = vi.fn(runQueuedCollectionWriteImpl) as typeof runQueuedCollectionWriteImpl;
	const setMadeEdits = vi.fn((madeEdits: boolean) => {
		state = {
			...state,
			hasUnsavedDraft: madeEdits
		};
	});
	const setSavingCollection = vi.fn();
	const resetValidationState = vi.fn();
	const openNotification = vi.fn();
	const logger = {
		error: vi.fn()
	};
	const runner = createCollectionLifecycleCommandRunner({
		applyLifecycleResult: input.applyLifecycleResult,
		client,
		getState: () => state,
		logger,
		onLifecycleResultApplied: input.onLifecycleResultApplied,
		openNotification,
		resetValidationState,
		runQueuedCollectionWrite,
		setMadeEdits,
		setSavingCollection,
		updateState
	});

	return {
		client,
		getState: () => state,
		logger,
		openNotification,
		resetValidationState,
		runQueuedCollectionWrite,
		runner,
		setMadeEdits,
		setSavingCollection,
		updateState
	};
}

describe('collection-lifecycle-command-runner', () => {
	it('forwards dirty Active Collection Draft state and applies successful switch results', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:a'] };
		const client = createClient();
		const applyLifecycleResult = vi.fn();
		vi.mocked(client.switchCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(DEFAULT_CONFIG, altCollection, [defaultCollection, altCollection])
		);
		const harness = createRunnerHarness({
			applyLifecycleResult,
			client,
			state: {
				activeCollection: defaultCollection,
				config: {
					...DEFAULT_CONFIG,
					activeCollection: 'default'
				},
				hasUnsavedDraft: true
			}
		});
		vi.mocked(harness.runQueuedCollectionWrite).mockImplementationOnce(async (operation) => {
			expect(client.switchCollectionLifecycle).not.toHaveBeenCalled();
			const result = await operation();
			expect(client.switchCollectionLifecycle).toHaveBeenCalledOnce();
			return result;
		});

		await harness.runner.run({ kind: 'switch', name: 'alt' });

		expect(harness.runQueuedCollectionWrite).toHaveBeenCalledOnce();
		expect(client.switchCollectionLifecycle).toHaveBeenCalledWith({
			config: expect.objectContaining({ activeCollection: 'default' }),
			dirtyCollection: defaultCollection,
			name: 'alt'
		});
		expect(harness.updateState).toHaveBeenCalledWith({
			allCollections: new Map([
				['default', defaultCollection],
				['alt', altCollection]
			]),
			allCollectionNames: new Set(['default', 'alt']),
			activeCollection: altCollection,
			config: expect.objectContaining({ activeCollection: 'alt' })
		});
		expect(applyLifecycleResult).toHaveBeenCalledWith(
			expect.objectContaining({
				ok: true,
				activeCollection: altCollection
			})
		);
		expect(harness.setMadeEdits).toHaveBeenCalledWith(false);
		expect(harness.resetValidationState).toHaveBeenCalled();
		expect(harness.openNotification).not.toHaveBeenCalledWith(expect.anything(), 'success');
	});

	it('reports successful lifecycle results to the workspace owner when provided', async () => {
		const defaultCollection = { name: 'default', mods: ['local:dirty'] };
		const altCollection = { name: 'alt', mods: ['local:a'] };
		const client = createClient();
		const onLifecycleResultApplied = vi.fn();
		vi.mocked(client.switchCollectionLifecycle).mockResolvedValueOnce(
			lifecycleSuccess(DEFAULT_CONFIG, altCollection, [defaultCollection, altCollection])
		);
		const harness = createRunnerHarness({
			client,
			onLifecycleResultApplied,
			state: {
				activeCollection: defaultCollection,
				config: {
					...DEFAULT_CONFIG,
					activeCollection: 'default'
				},
				hasUnsavedDraft: true
			}
		});

		await harness.runner.run({ kind: 'switch', name: 'alt' });

		expect(onLifecycleResultApplied).toHaveBeenCalledOnce();
		expect(harness.setMadeEdits).not.toHaveBeenCalled();
		expect(harness.resetValidationState).toHaveBeenCalled();
	});

	it('validates named lifecycle intents before queueing writes', async () => {
		const harness = createRunnerHarness({});

		await harness.runner.run({ kind: 'create', name: ' ' });

		expect(harness.runQueuedCollectionWrite).not.toHaveBeenCalled();
		expect(harness.client.createCollectionLifecycle).not.toHaveBeenCalled();
		expect(harness.openNotification).toHaveBeenCalledWith(
			{
				message: 'Collection name cannot be empty',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
	});

	it('reports lifecycle failures without applying returned state', async () => {
		const client = createClient();
		vi.mocked(client.renameCollectionLifecycle).mockResolvedValueOnce({
			ok: false,
			code: 'rollback-failed',
			message: 'Renamed collection default but failed to persist the active collection change'
		});
		const harness = createRunnerHarness({ client });

		await harness.runner.run({ kind: 'rename', name: 'renamed', previousName: 'default' });

		expect(harness.updateState).not.toHaveBeenCalled();
		expect(harness.setMadeEdits).not.toHaveBeenCalled();
		expect(harness.openNotification).toHaveBeenCalledWith(
			{
				message: 'Renamed collection default but failed to persist the active collection change',
				placement: 'bottomLeft',
				duration: null
			},
			'error'
		);
	});

	it('reports unexpected switch errors without applying returned state', async () => {
		const client = createClient();
		const error = new Error('switch failed unexpectedly');
		vi.mocked(client.switchCollectionLifecycle).mockRejectedValueOnce(error);
		const harness = createRunnerHarness({ client });

		await harness.runner.run({ kind: 'switch', name: 'alt' });

		expect(harness.updateState).not.toHaveBeenCalled();
		expect(harness.logger.error).toHaveBeenCalledWith(error);
		expect(harness.openNotification).toHaveBeenCalledWith(
			{
				message: 'Collection action failed',
				placement: 'bottomRight',
				duration: null
			},
			'error'
		);
		expect(harness.setSavingCollection).toHaveBeenNthCalledWith(1, true);
		expect(harness.setSavingCollection).toHaveBeenLastCalledWith(false);
	});

	it('skips switching to the already Active Collection', async () => {
		const harness = createRunnerHarness({
			state: {
				activeCollection: { name: 'default', mods: [] },
				config: {
					...DEFAULT_CONFIG,
					activeCollection: 'default'
				},
				hasUnsavedDraft: false
			}
		});

		await harness.runner.run({ kind: 'switch', name: 'default' });

		expect(harness.runQueuedCollectionWrite).not.toHaveBeenCalled();
		expect(harness.client.switchCollectionLifecycle).not.toHaveBeenCalled();
	});

	it('keeps notification and state mapping policy outside the hook', () => {
		const activeCollection = { name: 'fresh', mods: [] };
		const result = lifecycleSuccess(DEFAULT_CONFIG, activeCollection, [activeCollection]);

		expect(getCollectionLifecycleStateUpdate(result)).toEqual({
			allCollections: new Map([['fresh', activeCollection]]),
			allCollectionNames: new Set(['fresh']),
			activeCollection,
			config: expect.objectContaining({ activeCollection: 'fresh' })
		});
		expect(
			getCollectionLifecycleSuccessNotification(
				{ kind: 'duplicate', name: 'fresh copy', sourceName: 'fresh' },
				{
					activeCollection,
					config: DEFAULT_CONFIG,
					hasUnsavedDraft: false
				}
			)
		).toEqual({
			message: 'Duplicated collection fresh',
			placement: 'bottomRight',
			duration: 1
		});
		expect(
			getCollectionLifecycleFailureNotification({
				ok: false,
				code: 'collection-write-failed',
				message: 'Failed to create collection fresh'
			})
		).toEqual({
			message: 'Failed to create collection fresh',
			placement: 'bottomRight',
			duration: null
		});
	});
});
