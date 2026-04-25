import type { AppConfig } from 'model/AppConfig';
import type { ModCollection } from 'model/ModCollection';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { cloneCollection, copyCollectionsMap, withActiveCollection } from './hooks/collections/utils';

export interface CollectionWorkspaceSnapshot {
	activeCollection?: ModCollection;
	allCollectionNames: Set<string>;
	allCollections: Map<string, ModCollection>;
	config: AppConfig;
}

export interface CollectionLifecycleSnapshotResult {
	activeCollection: ModCollection;
	allCollectionNames: Set<string>;
	allCollections: Map<string, ModCollection>;
	config: AppConfig;
	createdFallbackCollection?: boolean;
}

export function collectionWorkspaceSnapshot(appState: CollectionWorkspaceAppState): CollectionWorkspaceSnapshot {
	return {
		activeCollection: appState.activeCollection,
		allCollectionNames: appState.allCollectionNames,
		allCollections: appState.allCollections,
		config: appState.config
	};
}

export function createCollectionSnapshot(
	snapshot: CollectionWorkspaceSnapshot,
	name: string,
	mods: string[] = []
): CollectionLifecycleSnapshotResult {
	const newCollection: ModCollection = {
		name,
		mods: [...mods]
	};
	const nextCollections = copyCollectionsMap(snapshot.allCollections);
	nextCollections.set(name, newCollection);
	const nextCollectionNames = new Set(snapshot.allCollectionNames);
	nextCollectionNames.add(name);

	return {
		activeCollection: newCollection,
		allCollectionNames: nextCollectionNames,
		allCollections: nextCollections,
		config: withActiveCollection(snapshot.config, name)
	};
}

export function duplicateActiveCollectionSnapshot(snapshot: CollectionWorkspaceSnapshot, name: string) {
	if (!snapshot.activeCollection) {
		return undefined;
	}

	return createCollectionSnapshot(snapshot, name, snapshot.activeCollection.mods);
}

export function renameActiveCollectionSnapshot(snapshot: CollectionWorkspaceSnapshot, name: string) {
	if (!snapshot.activeCollection) {
		return undefined;
	}

	const oldName = snapshot.activeCollection.name;
	const renamedCollection: ModCollection = {
		...cloneCollection(snapshot.activeCollection),
		name
	};
	const nextCollections = copyCollectionsMap(snapshot.allCollections);
	nextCollections.delete(oldName);
	nextCollections.set(name, renamedCollection);
	const nextCollectionNames = new Set(snapshot.allCollectionNames);
	nextCollectionNames.delete(oldName);
	nextCollectionNames.add(name);

	return {
		activeCollection: renamedCollection,
		allCollectionNames: nextCollectionNames,
		allCollections: nextCollections,
		config: withActiveCollection(snapshot.config, name)
	};
}

export function deleteActiveCollectionSnapshot(snapshot: CollectionWorkspaceSnapshot): CollectionLifecycleSnapshotResult | undefined {
	if (!snapshot.activeCollection) {
		return undefined;
	}

	const deletedName = snapshot.activeCollection.name;
	const nextCollections = copyCollectionsMap(snapshot.allCollections);
	nextCollections.delete(deletedName);
	const nextCollectionNames = new Set(snapshot.allCollectionNames);
	nextCollectionNames.delete(deletedName);

	let nextActiveCollection: ModCollection | undefined;
	if (nextCollectionNames.size > 0) {
		const [nextCollectionName] = [...nextCollectionNames].sort();
		nextActiveCollection = nextCollections.get(nextCollectionName);
	}

	let createdFallbackCollection = false;
	if (!nextActiveCollection) {
		nextActiveCollection = {
			name: 'default',
			mods: []
		};
		nextCollections.set(nextActiveCollection.name, nextActiveCollection);
		nextCollectionNames.add(nextActiveCollection.name);
		createdFallbackCollection = true;
	}

	return {
		activeCollection: nextActiveCollection,
		allCollectionNames: nextCollectionNames,
		allCollections: nextCollections,
		config: withActiveCollection(snapshot.config, nextActiveCollection.name),
		createdFallbackCollection
	};
}

export function switchActiveCollectionSnapshot(snapshot: CollectionWorkspaceSnapshot, name: string) {
	const nextActiveCollection = snapshot.allCollections.get(name);
	if (!nextActiveCollection || snapshot.activeCollection?.name === name) {
		return undefined;
	}

	return {
		activeCollection: cloneCollection(nextActiveCollection),
		allCollectionNames: snapshot.allCollectionNames,
		allCollections: snapshot.allCollections,
		config: withActiveCollection(snapshot.config, name)
	};
}
