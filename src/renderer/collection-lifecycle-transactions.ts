import type { AppConfig } from 'model/AppConfig';
import type { ModCollection } from 'model/ModCollection';
import {
	createCollectionSnapshot,
	duplicateActiveCollectionSnapshot,
	type CollectionLifecycleSnapshotResult,
	type CollectionWorkspaceSnapshot
} from './collection-lifecycle';

type NewCollectionFailureReason =
	| 'missing-active-collection'
	| 'dirty-collection-write-failed'
	| 'new-collection-write-failed'
	| 'config-write-failed';

export interface NewCollectionTransactionResult {
	committed: boolean;
	lifecycleResult?: CollectionLifecycleSnapshotResult;
	failureReason?: NewCollectionFailureReason;
	error?: unknown;
	rollbackFailed?: boolean;
	rollbackError?: unknown;
}

interface NewCollectionTransactionAdapters {
	persistDirtyCollection: (collection: ModCollection) => Promise<boolean>;
	updateCollection: (collection: ModCollection) => Promise<boolean>;
	deleteCollection: (name: string) => Promise<boolean>;
	writeConfig: (config: AppConfig) => Promise<void>;
	onBeforeNewCollectionWrite?: () => void;
}

interface RunNewCollectionTransactionOptions extends NewCollectionTransactionAdapters {
	dirtyCollection?: ModCollection;
	createSnapshot: () => CollectionLifecycleSnapshotResult | undefined;
}

export interface RunCreateCollectionTransactionOptions extends NewCollectionTransactionAdapters {
	snapshot: CollectionWorkspaceSnapshot;
	name: string;
	mods?: string[];
	dirtyCollection?: ModCollection;
}

export interface RunDuplicateCollectionTransactionOptions extends NewCollectionTransactionAdapters {
	snapshot: CollectionWorkspaceSnapshot;
	name: string;
	dirtyCollection?: ModCollection;
}

async function runNewCollectionTransaction({
	dirtyCollection,
	persistDirtyCollection,
	updateCollection,
	deleteCollection,
	writeConfig,
	onBeforeNewCollectionWrite,
	createSnapshot
}: RunNewCollectionTransactionOptions): Promise<NewCollectionTransactionResult> {
	if (dirtyCollection) {
		const dirtyPersisted = await persistDirtyCollection(dirtyCollection);
		if (!dirtyPersisted) {
			return {
				committed: false,
				failureReason: 'dirty-collection-write-failed'
			};
		}
	}

	onBeforeNewCollectionWrite?.();
	const lifecycleResult = createSnapshot();
	if (!lifecycleResult) {
		return {
			committed: false,
			failureReason: 'missing-active-collection'
		};
	}

	const newCollection = lifecycleResult.activeCollection;
	const writeSuccess = await updateCollection(newCollection);
	if (!writeSuccess) {
		return {
			committed: false,
			failureReason: 'new-collection-write-failed'
		};
	}

	try {
		await writeConfig(lifecycleResult.config);
	} catch (error) {
		try {
			const rolledBack = await deleteCollection(newCollection.name);
			return {
				committed: false,
				failureReason: 'config-write-failed',
				error,
				rollbackFailed: !rolledBack
			};
		} catch (rollbackError) {
			return {
				committed: false,
				failureReason: 'config-write-failed',
				error,
				rollbackFailed: true,
				rollbackError
			};
		}
	}

	return {
		committed: true,
		lifecycleResult
	};
}

export function runCreateCollectionTransaction({
	snapshot,
	name,
	mods,
	dirtyCollection,
	persistDirtyCollection,
	updateCollection,
	deleteCollection,
	writeConfig,
	onBeforeNewCollectionWrite
}: RunCreateCollectionTransactionOptions): Promise<NewCollectionTransactionResult> {
	return runNewCollectionTransaction({
		dirtyCollection,
		persistDirtyCollection,
		updateCollection,
		deleteCollection,
		writeConfig,
		onBeforeNewCollectionWrite,
		createSnapshot: () => createCollectionSnapshot(snapshot, name, mods || [])
	});
}

export function runDuplicateCollectionTransaction({
	snapshot,
	name,
	dirtyCollection,
	persistDirtyCollection,
	updateCollection,
	deleteCollection,
	writeConfig,
	onBeforeNewCollectionWrite
}: RunDuplicateCollectionTransactionOptions): Promise<NewCollectionTransactionResult> {
	return runNewCollectionTransaction({
		dirtyCollection,
		persistDirtyCollection,
		updateCollection,
		deleteCollection,
		writeConfig,
		onBeforeNewCollectionWrite,
		createSnapshot: () => duplicateActiveCollectionSnapshot(snapshot, name)
	});
}
