import { z } from 'zod';
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
import { parseIpcPayload } from './ipc-validation';

const collectionNameSchema = z.string();
const modCollectionSchema = z
	.object({
		name: collectionNameSchema,
		mods: z.array(z.string()).max(MAX_COLLECTION_MODS)
	})
	.passthrough();
const storedModCollectionSchema = z
	.object({
		mods: z.array(z.string()).max(MAX_COLLECTION_MODS)
	})
	.passthrough();
const collectionLifecycleBaseRequestSchema = z
	.object({
		config: appConfigPayloadSchema,
		dirtyCollection: modCollectionSchema.optional()
	})
	.passthrough();
const createCollectionLifecycleRequestSchema = collectionLifecycleBaseRequestSchema.extend({
	name: collectionNameSchema,
	mods: z.array(z.string()).max(MAX_COLLECTION_MODS).optional()
});
const namedCollectionLifecycleRequestSchema = collectionLifecycleBaseRequestSchema.extend({
	name: collectionNameSchema
});

export function parseCollectionNamePayload(channel: ValidChannel, payload: unknown): string {
	return parseIpcPayload(channel, collectionNameSchema, payload);
}

export function parseStoredModCollectionPayload(channel: ValidChannel, payload: unknown): Pick<ModCollection, 'mods'> {
	return parseIpcPayload(channel, storedModCollectionSchema, payload);
}

export function parseCollectionContentSaveRequest(channel: ValidChannel, payload: unknown): CollectionContentSaveRequest {
	return parseIpcPayload(channel, collectionContentSaveRequestSchema, payload) as CollectionContentSaveRequest;
}

export function parseCreateCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): CreateCollectionLifecycleRequest {
	return parseIpcPayload(channel, createCollectionLifecycleRequestSchema, payload) as CreateCollectionLifecycleRequest;
}

export function parseDuplicateCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): DuplicateCollectionLifecycleRequest {
	return parseIpcPayload(channel, namedCollectionLifecycleRequestSchema, payload) as DuplicateCollectionLifecycleRequest;
}

export function parseRenameCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): RenameCollectionLifecycleRequest {
	return parseIpcPayload(channel, namedCollectionLifecycleRequestSchema, payload) as RenameCollectionLifecycleRequest;
}

export function parseDeleteCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): CollectionLifecycleBaseRequest {
	return parseIpcPayload(channel, collectionLifecycleBaseRequestSchema, payload) as CollectionLifecycleBaseRequest;
}

export function parseSwitchCollectionLifecycleRequest(channel: ValidChannel, payload: unknown): SwitchCollectionLifecycleRequest {
	return parseIpcPayload(channel, namedCollectionLifecycleRequestSchema, payload) as SwitchCollectionLifecycleRequest;
}

export function parseStartupCollectionResolutionRequest(channel: ValidChannel, payload: unknown): StartupCollectionResolutionRequest {
	return parseIpcPayload(
		channel,
		collectionLifecycleBaseRequestSchema.pick({ config: true }),
		payload
	) as StartupCollectionResolutionRequest;
}
