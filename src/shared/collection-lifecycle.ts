import type { AppConfig } from 'model/AppConfig';
import type { ModCollection } from 'model/ModCollection';

export type CollectionLifecycleFailureCode =
	| 'invalid-name'
	| 'duplicate-name'
	| 'missing-active-collection'
	| 'missing-target-collection'
	| 'dirty-collection-write-failed'
	| 'collection-write-failed'
	| 'collection-delete-failed'
	| 'config-write-failed'
	| 'rollback-failed';

export interface CollectionLifecycleBaseRequest {
	config: AppConfig;
	dirtyCollection?: ModCollection;
}

export interface CreateCollectionLifecycleRequest extends CollectionLifecycleBaseRequest {
	name: string;
	mods?: string[];
}

export interface DuplicateCollectionLifecycleRequest extends CollectionLifecycleBaseRequest {
	name: string;
}

export interface RenameCollectionLifecycleRequest extends CollectionLifecycleBaseRequest {
	name: string;
}

export interface DeleteCollectionLifecycleRequest extends CollectionLifecycleBaseRequest {}

export interface SwitchCollectionLifecycleRequest extends CollectionLifecycleBaseRequest {
	name: string;
}

interface CollectionLifecycleSuccess {
	ok: true;
	activeCollection: ModCollection;
	collections: ModCollection[];
	collectionNames: string[];
	config: AppConfig;
}

interface CollectionLifecycleFailure {
	ok: false;
	code: CollectionLifecycleFailureCode;
	message: string;
}

export type CollectionLifecycleResult = CollectionLifecycleSuccess | CollectionLifecycleFailure;
