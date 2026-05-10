import { z } from 'zod';
import type { ModCollection } from 'model/ModCollection';
import { MAX_COLLECTION_MODS } from './collection-payload';

export interface CollectionContentSaveRequest {
	collectionName: string;
	mods: string[];
}

type CollectionContentSaveFailureCode = 'missing-collection' | 'write-failed';

export type CollectionContentSaveResult =
	| {
			collection: ModCollection;
			ok: true;
	  }
	| {
			code: CollectionContentSaveFailureCode;
			message: string;
			ok: false;
	  };

export const collectionContentSaveRequestSchema = z
	.object({
		collectionName: z.string(),
		mods: z.array(z.string()).max(MAX_COLLECTION_MODS)
	})
	.passthrough();

export function createCollectionContentSaveRequest(collection: ModCollection): CollectionContentSaveRequest {
	return {
		collectionName: collection.name,
		mods: [...collection.mods]
	};
}
