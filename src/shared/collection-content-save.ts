import { Schema } from 'effect';
import type { ModCollection } from 'model/ModCollection';
import { collectionModsSchema } from './collection-payload';

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

export const collectionContentSaveRequestSchema = Schema.Struct({
	collectionName: Schema.String,
	mods: collectionModsSchema
});

export function createCollectionContentSaveRequest(collection: ModCollection): CollectionContentSaveRequest {
	return {
		collectionName: collection.name,
		mods: [...collection.mods]
	};
}
