import type { CollectionContentSaveRequest, CollectionContentSaveResult } from 'shared/collection-content-save';
import { readCollectionFile, updateCollectionFile } from './collection-store';

export function saveExistingCollectionContent(userDataPath: string, request: CollectionContentSaveRequest): CollectionContentSaveResult {
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

	return { ok: true };
}
