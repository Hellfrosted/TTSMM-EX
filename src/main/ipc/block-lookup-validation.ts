import { Schema } from 'effect';
import {
	BLOCK_LOOKUP_SEARCH_RESULT_LIMIT,
	type BlockLookupBuildRequest,
	type BlockLookupSearchRequest,
	type BlockLookupSettings
} from 'shared/block-lookup';
import type { ValidChannel } from 'shared/ipc';
import { parseEffectIpcPayload } from './ipc-validation';

const MAX_BLOCK_LOOKUP_MOD_SOURCES = 20_000;
const MAX_BLOCK_LOOKUP_QUERY_LENGTH = 1_000;

const blockLookupModSourceSchema = Schema.Struct({
	uid: Schema.String.check(Schema.isMinLength(1)),
	id: Schema.optional(Schema.String),
	name: Schema.optional(Schema.String),
	path: Schema.optional(Schema.String),
	workshopID: Schema.optional(Schema.String)
});

const blockLookupSettingsSchema = Schema.Struct({
	workshopRoot: Schema.String,
	renderedPreviewsEnabled: Schema.Boolean
});

const blockLookupBuildRequestSchema = Schema.Struct({
	workshopRoot: Schema.optional(Schema.String),
	gameExec: Schema.optional(Schema.String),
	modSources: Schema.optional(Schema.Array(blockLookupModSourceSchema).check(Schema.isMaxLength(MAX_BLOCK_LOOKUP_MOD_SOURCES))),
	forceRebuild: Schema.optional(Schema.Boolean),
	renderedPreviewsEnabled: Schema.optional(Schema.Boolean)
});

const blockLookupSearchRequestSchema = Schema.Struct({
	query: Schema.String.check(Schema.isMaxLength(MAX_BLOCK_LOOKUP_QUERY_LENGTH)),
	limit: Schema.optional(
		Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(BLOCK_LOOKUP_SEARCH_RESULT_LIMIT))
	)
});

export function parseBlockLookupSettingsPayload(channel: ValidChannel, payload: unknown): BlockLookupSettings {
	return parseEffectIpcPayload(channel, blockLookupSettingsSchema, payload, { onExcessProperty: 'ignore' });
}

export function parseBlockLookupBuildRequestPayload(channel: ValidChannel, payload: unknown): BlockLookupBuildRequest {
	return parseEffectIpcPayload(channel, blockLookupBuildRequestSchema, payload, { onExcessProperty: 'ignore' }) as BlockLookupBuildRequest;
}

export function parseBlockLookupSearchRequestPayload(channel: ValidChannel, payload: unknown): BlockLookupSearchRequest {
	return parseEffectIpcPayload(channel, blockLookupSearchRequestSchema, payload, { onExcessProperty: 'ignore' });
}
