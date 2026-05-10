import { z } from 'zod';
import {
	BLOCK_LOOKUP_SEARCH_RESULT_LIMIT,
	type BlockLookupBuildRequest,
	type BlockLookupSearchRequest,
	type BlockLookupSettings
} from 'shared/block-lookup';
import type { ValidChannel } from 'shared/ipc';
import { parseIpcPayload } from './ipc-validation';

const MAX_BLOCK_LOOKUP_MOD_SOURCES = 20_000;
const MAX_BLOCK_LOOKUP_QUERY_LENGTH = 1_000;

const blockLookupModSourceSchema = z.object({
	uid: z.string().min(1),
	id: z.string().optional(),
	name: z.string().optional(),
	path: z.string().optional(),
	workshopID: z.string().optional()
});

const blockLookupSettingsSchema = z.object({
	workshopRoot: z.string(),
	renderedPreviewsEnabled: z.boolean()
});

const blockLookupBuildRequestSchema = z.object({
	workshopRoot: z.string().optional(),
	gameExec: z.string().optional(),
	modSources: z.array(blockLookupModSourceSchema).max(MAX_BLOCK_LOOKUP_MOD_SOURCES).optional(),
	forceRebuild: z.boolean().optional(),
	renderedPreviewsEnabled: z.boolean().optional()
});

const blockLookupSearchRequestSchema = z.object({
	query: z.string().max(MAX_BLOCK_LOOKUP_QUERY_LENGTH),
	limit: z.number().int().positive().max(BLOCK_LOOKUP_SEARCH_RESULT_LIMIT).optional()
});

export function parseBlockLookupSettingsPayload(channel: ValidChannel, payload: unknown): BlockLookupSettings {
	return parseIpcPayload(channel, blockLookupSettingsSchema, payload);
}

export function parseBlockLookupBuildRequestPayload(channel: ValidChannel, payload: unknown): BlockLookupBuildRequest {
	return parseIpcPayload(channel, blockLookupBuildRequestSchema, payload);
}

export function parseBlockLookupSearchRequestPayload(channel: ValidChannel, payload: unknown): BlockLookupSearchRequest {
	return parseIpcPayload(channel, blockLookupSearchRequestSchema, payload);
}
