import { Schema } from 'effect';
import type { ModCollection } from 'model';
import { collectionContentSaveRequestSchema, type CollectionContentSaveRequest } from 'shared/collection-content-save';
import type {
	CollectionLifecycleBaseRequest,
	CreateCollectionLifecycleRequest,
	DuplicateCollectionLifecycleRequest,
	RenameCollectionLifecycleRequest,
	SwitchCollectionLifecycleRequest
} from 'shared/collection-lifecycle';
import type { StartupCollectionResolutionRequest } from 'shared/startup-collection-resolution';
import type { ValidChannel } from 'shared/ipc';
import { MAX_COLLECTION_MODS } from 'shared/collection-payload';
import { appConfigPayloadSchema } from './config-validation';
import { parseEffectIpcPayload } from './ipc-validation';

const collectionNameSchema = Schema.String;
const collectionModsSchema = Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_COLLECTION_MODS));
const modCollectionSchema = Schema.Struct({
	name: collectionNameSchema,
	mods: collectionModsSchema
});
const storedModCollectionSchema = Schema.Struct({
	mods: collectionModsSchema
});
const collectionLifecycleBaseRequestSchema = Schema.Struct({
	config: appConfigPayloadSchema,
	dirtyCollection: Schema.optional(modCollectionSchema)
});
const createCollectionLifecycleRequestSchema = Schema.Struct({
	config: appConfigPayloadSchema,
	dirtyCollection: Schema.optional(modCollectionSchema),
	name: collectionNameSchema,
	mods: Schema.optional(collectionModsSchema)
});
const namedCollectionLifecycleRequestSchema = Schema.Struct({
	config: appConfigPayloadSchema,
	dirtyCollection: Schema.optional(modCollectionSchema),
	name: collectionNameSchema
});
const startupCollectionResolutionRequestSchema = Schema.Struct({
	config: appConfigPayloadSchema
});

export function parseCollectionNamePayload(channel: ValidChannel, payload: unknown): string {
	return parseEffectIpcPayload(channel, collectionNameSchema, payload);
}

export function parseStoredModCollectionPayload(channel: ValidChannel, payload: unknown): Pick<ModCollection, 'mods'> {
	return parseEffectIpcPayload(channel, storedModCollectionSchema, payload) as Pick<ModCollection, 'mods'>;
}

export function parseCollectionContentSaveRequest(channel: ValidChannel, payload: unknown): CollectionContentSaveRequest {
	return parseEffectIpcPayload(channel, collectionContentSaveRequestSchema, payload) as CollectionContentSaveRequest;
}

export function parseCreateCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): CreateCollectionLifecycleRequest {
	return parseEffectIpcPayload(channel, createCollectionLifecycleRequestSchema, payload) as CreateCollectionLifecycleRequest;
}

export function parseDuplicateCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): DuplicateCollectionLifecycleRequest {
	return parseEffectIpcPayload(channel, namedCollectionLifecycleRequestSchema, payload) as DuplicateCollectionLifecycleRequest;
}

export function parseRenameCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): RenameCollectionLifecycleRequest {
	return parseEffectIpcPayload(channel, namedCollectionLifecycleRequestSchema, payload) as RenameCollectionLifecycleRequest;
}

export function parseDeleteCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): CollectionLifecycleBaseRequest {
	return parseEffectIpcPayload(channel, collectionLifecycleBaseRequestSchema, payload) as CollectionLifecycleBaseRequest;
}

export function parseSwitchCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): SwitchCollectionLifecycleRequest {
	return parseEffectIpcPayload(channel, namedCollectionLifecycleRequestSchema, payload) as SwitchCollectionLifecycleRequest;
}

export function parseStartupCollectionResolutionRequest(channel: ValidChannel, payload: unknown): StartupCollectionResolutionRequest {
	return parseEffectIpcPayload(channel, startupCollectionResolutionRequestSchema, payload) as StartupCollectionResolutionRequest;
}
