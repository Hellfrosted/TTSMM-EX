import { z } from 'zod';
import type { ValidChannel } from 'shared/ipc';

function formatInvalidPayloadMessage(channel: ValidChannel, error: z.ZodError) {
	const details = error.issues.map((issue) => `${issue.path.join('.') || '<payload>'}: ${issue.message}`).join('; ');
	return `Invalid IPC payload for ${channel}: ${details}`;
}

export function parseIpcPayload<T>(channel: ValidChannel, schema: z.ZodType<T>, payload: unknown): T {
	const result = schema.safeParse(payload);
	if (!result.success) {
		throw new Error(formatInvalidPayloadMessage(channel, result.error));
	}
	return result.data;
}
