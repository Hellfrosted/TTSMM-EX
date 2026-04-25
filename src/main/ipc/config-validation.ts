import { z } from 'zod';
import type { AppConfig } from 'model';
import type { ValidChannel } from 'shared/ipc';
import { parseIpcPayload } from './ipc-validation';

const appConfigPayloadSchema = z
	.object({
		closeOnLaunch: z.boolean(),
		language: z.string(),
		localDir: z.string().optional(),
		gameExec: z.string(),
		workshopID: z.bigint(),
		activeCollection: z.string().optional(),
		extraParams: z.string().optional(),
		logParams: z.record(z.string(), z.string()).optional(),
		logLevel: z.string().optional(),
		logsDir: z.string(),
		steamMaxConcurrency: z.number().int().positive(),
		currentPath: z.string(),
		viewConfigs: z.record(z.string(), z.unknown()),
		ignoredValidationErrors: z.instanceof(Map),
		userOverrides: z.instanceof(Map),
		pureVanilla: z.boolean().optional()
	})
	.passthrough();

export function parseAppConfigPayload(channel: ValidChannel, payload: unknown): AppConfig {
	return parseIpcPayload(channel, appConfigPayloadSchema, payload) as AppConfig;
}
