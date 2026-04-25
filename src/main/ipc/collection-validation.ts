import { z } from 'zod';
import type { ModCollection } from 'model';
import type { ValidChannel } from 'shared/ipc';
import { parseIpcPayload } from './ipc-validation';

const MAX_COLLECTION_MODS = 100_000;

const collectionNameSchema = z.string();
const modCollectionSchema = z
	.object({
		name: collectionNameSchema,
		mods: z.array(z.string()).max(MAX_COLLECTION_MODS)
	})
	.passthrough();

export function parseCollectionNamePayload(channel: ValidChannel, payload: unknown): string {
	return parseIpcPayload(channel, collectionNameSchema, payload);
}

export function parseModCollectionPayload(channel: ValidChannel, payload: unknown): ModCollection {
	return parseIpcPayload(channel, modCollectionSchema, payload) as ModCollection;
}
