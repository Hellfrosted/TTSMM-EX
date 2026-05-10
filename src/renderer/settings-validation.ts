import { z } from 'zod';
import { NLogLevel } from 'model';
import type { EditingConfig } from './hooks/useSettingsForm';

const nLogLevelValues = [
	NLogLevel.OFF,
	NLogLevel.FATAL,
	NLogLevel.ERROR,
	NLogLevel.WARN,
	NLogLevel.INFO,
	NLogLevel.DEBUG,
	NLogLevel.TRACE
] as const;

const logConfigSchema = z.object({
	loggerID: z.string(),
	level: z.enum(nLogLevelValues)
});

const settingsFormShapeSchema = z.object({
	editingLogConfig: z.array(logConfigSchema)
});

export const settingsFormSchema = z
	.custom<EditingConfig>((value) => settingsFormShapeSchema.safeParse(value).success, 'Invalid settings form data')
	.superRefine((config, context) => {
		const loggerCounts = config.editingLogConfig.reduce<Record<string, number>>((counts, logConfig) => {
			const loggerID = logConfig.loggerID.trim();
			if (loggerID) {
				counts[loggerID] = (counts[loggerID] || 0) + 1;
			}
			return counts;
		}, {});

		config.editingLogConfig.forEach((logConfig, index) => {
			const loggerID = logConfig.loggerID.trim();
			if (!loggerID) {
				context.addIssue({
					code: 'custom',
					message: 'Logger ID is required',
					path: ['editingLogConfig', index, 'loggerID']
				});
			}
			if (!loggerID || loggerCounts[loggerID] <= 1) {
				return;
			}

			context.addIssue({
				code: 'custom',
				message: 'Duplicate logger IDs',
				path: ['editingLogConfig', index, 'loggerID']
			});
		});
	});

export function getSettingsFormErrors(config: EditingConfig) {
	const result = settingsFormSchema.safeParse(config);
	if (result.success) {
		return {};
	}

	return result.error.issues.reduce<{ [field: string]: string }>((errors, issue) => {
		const field = issue.path.join('.');
		if (field) {
			errors[field] = issue.message;
		}
		return errors;
	}, {});
}
