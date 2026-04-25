import { z } from 'zod';
import { ModType, type ModData } from '../../model';
import type { ValidChannel } from 'shared/ipc';
import { parseIpcPayload } from './ipc-validation';

const MAX_KNOWN_MODS = 100_000;

const workshopIdSchema = z.bigint().positive();

const readModMetadataPayloadSchema = z.object({
	localDir: z.string().optional(),
	allKnownMods: z.array(z.string()).max(MAX_KNOWN_MODS)
});

const modContextMenuRecordSchema = z
	.object({
		uid: z.string().min(1),
		id: z.string().nullable(),
		type: z.enum(ModType),
		path: z.string().optional(),
		workshopID: z.bigint().positive().optional(),
		subscribed: z.boolean().optional(),
		needsUpdate: z.boolean().optional()
	})
	.passthrough();

export function parseWorkshopIdPayload(channel: ValidChannel, payload: unknown): bigint {
	return parseIpcPayload(channel, workshopIdSchema, payload);
}

export function parseReadModMetadataPayload(
	channel: ValidChannel,
	localDir: unknown,
	allKnownMods: unknown
): { localDir?: string; allKnownMods: string[] } {
	return parseIpcPayload(channel, readModMetadataPayloadSchema, {
		localDir,
		allKnownMods
	});
}

export function parseModContextMenuPayload(channel: ValidChannel, payload: unknown): ModData {
	return parseIpcPayload(channel, modContextMenuRecordSchema, payload) as ModData;
}
