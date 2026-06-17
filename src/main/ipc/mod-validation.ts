import { Schema } from 'effect';
import type { ValidChannel } from 'shared/ipc';
import type { ModContextMenuRequest } from 'shared/mod-context-menu';
import { parseEffectIpcPayload } from './ipc-validation';

const MAX_KNOWN_MODS = 100_000;

const workshopIdSchema = Schema.BigInt.check(Schema.isGreaterThanBigInt(0n));

const readModMetadataPayloadSchema = Schema.Struct({
	localDir: Schema.optional(Schema.String),
	allKnownMods: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_KNOWN_MODS)),
	treatNuterraSteamBetaAsEquivalent: Schema.optional(Schema.Boolean)
});

const modContextMenuRequestSchema = Schema.Struct({
	uid: Schema.String.check(Schema.isMinLength(1))
});

export interface ReadModMetadataPayload {
	readonly localDir?: string;
	readonly allKnownMods: readonly string[];
	readonly treatNuterraSteamBetaAsEquivalent?: boolean;
}

export function parseWorkshopIdPayload(channel: ValidChannel, payload: unknown): bigint {
	return parseEffectIpcPayload(channel, workshopIdSchema, payload);
}

export function parseReadModMetadataPayload(
	channel: ValidChannel,
	localDir: unknown,
	allKnownMods: unknown,
	treatNuterraSteamBetaAsEquivalent?: unknown
): ReadModMetadataPayload {
	return parseEffectIpcPayload(
		channel,
		readModMetadataPayloadSchema,
		{
			localDir,
			allKnownMods,
			treatNuterraSteamBetaAsEquivalent
		},
		{ onExcessProperty: 'ignore' }
	) as ReadModMetadataPayload;
}

export function parseModContextMenuPayload(channel: ValidChannel, payload: unknown): ModContextMenuRequest {
	return parseEffectIpcPayload(channel, modContextMenuRequestSchema, payload, { onExcessProperty: 'error' });
}
