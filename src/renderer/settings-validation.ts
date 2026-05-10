import { Schema } from 'effect';
import { LogLevel, NLogLevel } from 'model';
import type { AppConfig } from 'model';
import { createFormResolver, type FormErrorMap } from './form-resolver';

export interface LogConfig {
	level: NLogLevel;
	loggerID: string;
}

export interface EditingConfig extends AppConfig {
	editingLogConfig: LogConfig[];
}

export const APP_LOG_LEVEL_OPTIONS = [
	LogLevel.ERROR,
	LogLevel.WARN,
	LogLevel.INFO,
	LogLevel.VERBOSE,
	LogLevel.DEBUG,
	LogLevel.SILLY
] as const;
export const NLOG_LEVEL_OPTIONS = [
	NLogLevel.OFF,
	NLogLevel.FATAL,
	NLogLevel.ERROR,
	NLogLevel.WARN,
	NLogLevel.INFO,
	NLogLevel.DEBUG,
	NLogLevel.TRACE
] as const;

const logConfigSchema = Schema.Struct({
	loggerID: Schema.String,
	level: Schema.Literals([...NLOG_LEVEL_OPTIONS])
});

const settingsFormShapeSchema = Schema.Struct({
	editingLogConfig: Schema.Array(logConfigSchema)
});

function getSettingsFormShapeErrors(config: EditingConfig): FormErrorMap {
	try {
		Schema.decodeUnknownSync(settingsFormShapeSchema)(config);
		return {};
	} catch {
		return { editingLogConfig: 'Invalid settings form data' };
	}
}

function getLoggerFormErrors(config: EditingConfig): FormErrorMap {
	const loggerCounts = config.editingLogConfig.reduce<Record<string, number>>((counts, logConfig) => {
		const loggerID = logConfig.loggerID.trim();
		if (loggerID) {
			counts[loggerID] = (counts[loggerID] || 0) + 1;
		}
		return counts;
	}, {});

	return config.editingLogConfig.reduce<FormErrorMap>((errors, logConfig, index) => {
		const loggerID = logConfig.loggerID.trim();
		if (!loggerID) {
			errors[`editingLogConfig.${index}.loggerID`] = 'Logger ID is required';
		} else if (loggerCounts[loggerID] > 1) {
			errors[`editingLogConfig.${index}.loggerID`] = 'Duplicate logger IDs';
		}
		return errors;
	}, {});
}

export const settingsFormResolver = createFormResolver<EditingConfig>(getSettingsFormErrors);

export function getSettingsFormErrors(config: EditingConfig) {
	const shapeErrors = getSettingsFormShapeErrors(config);
	if (Object.keys(shapeErrors).length > 0) {
		return shapeErrors;
	}

	return getLoggerFormErrors(config);
}
