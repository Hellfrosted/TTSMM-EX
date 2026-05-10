import { cloneCollection, type AppConfig, type ModCollection } from 'model';
import type { AppStateUpdate } from 'model/AppState';

export interface AuthoritativeCollectionState {
	ok: true;
	activeCollection: ModCollection;
	collections: ModCollection[];
	collectionNames: string[];
	config: AppConfig;
}

interface AuthoritativeCollectionStateAdapters {
	syncCache?: (state: AuthoritativeCollectionState) => void;
	updateState: (update: AppStateUpdate) => void;
}

function assertSuccessfulAuthoritativeCollectionState(state: { ok?: boolean }) {
	if (state.ok === false) {
		throw new Error('Cannot apply failed authoritative Collection state result');
	}
}

function getCollectionsMap(collections: ModCollection[]) {
	return new Map(collections.map((collection) => [collection.name, cloneCollection(collection)]));
}

export function getAuthoritativeCollectionStateUpdate(state: AuthoritativeCollectionState): AppStateUpdate {
	assertSuccessfulAuthoritativeCollectionState(state);

	const allCollections = getCollectionsMap(state.collections);
	const activeCollection = allCollections.get(state.activeCollection.name) ?? cloneCollection(state.activeCollection);

	return {
		allCollections,
		allCollectionNames: new Set(state.collectionNames),
		activeCollection,
		config: state.config
	};
}

export function applyAuthoritativeCollectionState(state: AuthoritativeCollectionState, adapters: AuthoritativeCollectionStateAdapters) {
	adapters.updateState(getAuthoritativeCollectionStateUpdate(state));
	adapters.syncCache?.(state);
}
