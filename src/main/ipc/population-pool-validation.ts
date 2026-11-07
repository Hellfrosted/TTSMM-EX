import { Schema } from 'effect';
import type { ValidChannel } from 'shared/ipc';
import type {
	PopulationPoolCreateWorkshopRequest,
	PopulationPoolFileOperationRequest,
	PopulationPoolScanRequest
} from 'shared/population-pool';
import { parseEffectIpcPayload } from './ipc-validation';

const scanSchema = Schema.Struct({
	localDir: Schema.optional(Schema.String),
	gameExec: Schema.optional(Schema.String),
	workshopRoot: Schema.optional(Schema.String)
});
const rowSchema = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	source: Schema.Literals(['active', 'disabled', 'saved-candidate', 'workshop-candidate', 'workshop-request']),
	sourceLabel: Schema.String,
	status: Schema.String,
	compatibility: Schema.Literals(['compatible', 'candidate', 'incompatible', 'unavailable']),
	compatibilityLabel: Schema.String,
	path: Schema.optional(Schema.String),
	fileName: Schema.optional(Schema.String),
	workshopId: Schema.optional(Schema.String),
	tags: Schema.optional(Schema.Array(Schema.String)),
	previewUrl: Schema.optional(Schema.String),
	detail: Schema.optional(Schema.String),
	canStableAdd: Schema.Boolean,
	canDisable: Schema.Boolean,
	canRestore: Schema.Boolean,
	canRequestWorkshopAdd: Schema.Boolean
});
const fileOperationSchema = Schema.Struct({
	row: rowSchema,
	localDir: Schema.optional(Schema.String),
	confirmedWhileGameRunning: Schema.optional(Schema.Boolean),
	scanRequest: Schema.optional(scanSchema)
});
const workshopRequestSchema = Schema.Struct({ row: rowSchema, scanRequest: Schema.optional(scanSchema) });

export function parsePopulationScan(channel: ValidChannel, payload: unknown): PopulationPoolScanRequest {
	return parseEffectIpcPayload(channel, scanSchema, payload);
}

export function parsePopulationFileOperation(channel: ValidChannel, payload: unknown): PopulationPoolFileOperationRequest {
	return parseEffectIpcPayload(channel, fileOperationSchema, payload) as PopulationPoolFileOperationRequest;
}

export function parsePopulationWorkshopRequest(channel: ValidChannel, payload: unknown): PopulationPoolCreateWorkshopRequest {
	return parseEffectIpcPayload(channel, workshopRequestSchema, payload) as PopulationPoolCreateWorkshopRequest;
}
