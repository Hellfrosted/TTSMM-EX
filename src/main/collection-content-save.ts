import { Effect } from 'effect';
import type { CollectionContentSaveRequest, CollectionContentSaveResult } from 'shared/collection-content-save';
import { readCollectionFile, updateCollectionFile } from './collection-store';

export const saveExistingCollectionContent = Effect.fnUntraced(function* (
	userDataPath: string,
	request: CollectionContentSaveRequest
): Effect.fn.Return<CollectionContentSaveResult> {
	if (!readCollectionFile(userDataPath, request.collectionName)) {
		return {
			ok: false,
			code: 'missing-collection',
			message: `Collection ${request.collectionName} does not exist`
		};
	}

	const writeAccepted = updateCollectionFile(userDataPath, {
		name: request.collectionName,
		mods: [...request.mods]
	});
	if (!writeAccepted) {
		return {
			ok: false,
			code: 'write-failed',
			message: `Failed to save collection ${request.collectionName}`
		};
	}

	const savedCollection = readCollectionFile(userDataPath, request.collectionName);
	if (!savedCollection) {
		return {
			ok: false,
			code: 'write-failed',
			message: `Failed to read saved collection ${request.collectionName}`
		};
	}

	return { ok: true, collection: savedCollection };
});
