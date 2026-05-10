import { Schema } from 'effect';
import type { AppConfig } from 'model';
import type { ValidChannel } from 'shared/ipc';
import { parseEffectIpcPayload } from './ipc-validation';

export const appConfigPayloadSchema = Schema.StructWithRest(
	Schema.Struct({
		closeOnLaunch: Schema.Boolean,
		language: Schema.String,
		localDir: Schema.optional(Schema.String),
		gameExec: Schema.String,
		workshopID: Schema.BigInt.check(Schema.isGreaterThanBigInt(0n)),
		activeCollection: Schema.optional(Schema.String),
		extraParams: Schema.optional(Schema.String),
		logParams: Schema.optional(Schema.Record(Schema.String, Schema.String)),
		logLevel: Schema.optional(Schema.String),
		logsDir: Schema.String,
		steamMaxConcurrency: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
		currentPath: Schema.String,
		viewConfigs: Schema.Record(Schema.String, Schema.Unknown),
		ignoredValidationErrors: Schema.instanceOf(Map),
		userOverrides: Schema.instanceOf(Map),
		pureVanilla: Schema.optional(Schema.Boolean),
		treatNuterraSteamBetaAsEquivalent: Schema.Boolean
	}),
	[Schema.Record(Schema.String, Schema.Unknown)]
);

export function parseAppConfigPayload(channel: ValidChannel, payload: unknown): AppConfig {
	return parseEffectIpcPayload(channel, appConfigPayloadSchema, payload) as AppConfig;
}
