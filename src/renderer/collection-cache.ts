import { useAtomRef } from '@effect/atom-react';
import { Effect } from 'effect';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import type { ModCollection } from 'model/ModCollection';
import type { AuthoritativeCollectionState } from 'renderer/authoritative-collection-state';
import type { CollectionContentSaveResult } from 'shared/collection-content-save';
import { createCollectionContentSaveRequest } from 'shared/collection-content-save';
import type { CollectionLifecycleResult } from 'shared/collection-lifecycle';
import { useCacheMutation } from './cache-mutation';
import { setConfigCacheData } from './config-cache';
import { RendererElectron, runRenderer } from './runtime';

export interface CollectionCacheState {
	collectionNames: string[] | undefined;
	collections: Map<string, ModCollection | null>;
}

const collectionCacheRef = AtomRef.make<CollectionCacheState>({
	collectionNames: undefined,
	collections: new Map()
});

export function setCollectionCacheData(state: CollectionCacheState) {
	collectionCacheRef.set({
		collectionNames: state.collectionNames,
		collections: new Map(state.collections)
	});
}

export function useCollectionsListCacheValue() {
	return useAtomRef(collectionCacheRef).collectionNames;
}

export function useCollectionCacheValue(collectionName: string) {
	return useAtomRef(collectionCacheRef).collections.get(collectionName);
}

function updateCollectionCache(update: (state: CollectionCacheState) => CollectionCacheState) {
	setCollectionCacheData(update(collectionCacheRef.value));
}

export async function readCollectionsListCache(): Promise<string[]> {
	const cachedCollectionNames = collectionCacheRef.value.collectionNames;
	if (cachedCollectionNames !== undefined) {
		return cachedCollectionNames;
	}
	const collectionNames = await runRenderer(readCollectionsListEffect());
	updateCollectionCache((state) => ({
		...state,
		collectionNames
	}));
	return collectionNames;
}

const readCollectionsListEffect = Effect.fnUntraced(function* (): Effect.fn.Return<string[], unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const collections = yield* Effect.tryPromise({
		try: () => renderer.electron.readCollectionsList(),
		catch: (error) => error
	});
	return collections || [];
});

export async function readCollectionCache(collectionName: string): Promise<ModCollection | null> {
	if (collectionCacheRef.value.collections.has(collectionName)) {
		return collectionCacheRef.value.collections.get(collectionName) ?? null;
	}
	const collection = await runRenderer(readCollectionEffect(collectionName));
	updateCollectionCache((state) => ({
		...state,
		collections: new Map(state.collections).set(collectionName, collection)
	}));
	return collection;
}

const readCollectionEffect = Effect.fnUntraced(function* (
	collectionName: string
): Effect.fn.Return<ModCollection | null, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.readCollection(collectionName),
		catch: (error) => error
	});
});

const updateCollectionEffect = Effect.fnUntraced(function* (
	collection: ModCollection
): Effect.fn.Return<CollectionContentSaveResult, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	return yield* Effect.tryPromise({
		try: () => renderer.electron.updateCollection(createCollectionContentSaveRequest(collection)),
		catch: (error) => error
	});
});

function updateCollectionMutationFn(collection: ModCollection): Promise<CollectionContentSaveResult> {
	return runRenderer(updateCollectionEffect(collection));
}

function applyCollectionContentSaveResultToCache(result: Extract<CollectionContentSaveResult, { ok: true }>) {
	updateCollectionCache((state) => ({
		...state,
		collections: new Map(state.collections).set(result.collection.name, result.collection)
	}));
}

export function useUpdateCollectionMutation() {
	return useCacheMutation(updateCollectionMutationFn, (result) => {
		if (result.ok) {
			applyCollectionContentSaveResultToCache(result);
		}
	});
}

export function applyAuthoritativeCollectionStateToCache(result: AuthoritativeCollectionState) {
	setConfigCacheData(result.config);
	setCollectionCacheData({
		collectionNames: result.collectionNames,
		collections: new Map(result.collections.map((collection) => [collection.name, collection]))
	});
}

export function applyCollectionLifecycleResultToCache(result: Extract<CollectionLifecycleResult, { ok: true }>) {
	applyAuthoritativeCollectionStateToCache(result);
}
