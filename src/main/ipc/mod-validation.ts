import { z } from 'zod';
import type { ModContextMenuRequest } from 'shared/mod-context-menu';
import type { ValidChannel } from 'shared/ipc';
import { parseIpcPayload } from './ipc-validation';

const MAX_KNOWN_MODS = 100_000;

const workshopIdSchema = z.bigint().positive();

const readModMetadataPayloadSchema = z.object({
	localDir: z.string().optional(),
	allKnownMods: z.array(z.string()).max(MAX_KNOWN_MODS),
	treatNuterraSteamBetaAsEquivalent: z.boolean().optional()
});

const modContextMenuRequestSchema = z
	.object({
		uid: z.string().min(1)
	})
	.strict();

export function parseWorkshopIdPayload(channel: ValidChannel, payload: unknown): bigint {
	return parseIpcPayload(channel, workshopIdSchema, payload);
}

export function parseReadModMetadataPayload(
	channel: ValidChannel,
	localDir: unknown,
	allKnownMods: unknown,
	treatNuterraSteamBetaAsEquivalent?: unknown
): { localDir?: string; allKnownMods: string[]; treatNuterraSteamBetaAsEquivalent?: boolean } {
	return parseIpcPayload(channel, readModMetadataPayloadSchema, {
		localDir,
		allKnownMods,
		treatNuterraSteamBetaAsEquivalent
	});
}

export function parseModContextMenuPayload(channel: ValidChannel, payload: unknown): ModContextMenuRequest {
	return parseIpcPayload(channel, modContextMenuRequestSchema, payload);
}
