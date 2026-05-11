import { Schema } from 'effect';
import { type MainCollectionConfig, MainColumnTitles } from 'model';
import { getResolvedMainColumnMinWidth, normalizeMainCollectionConfig, normalizeMainColumnWidth } from 'shared/main-collection-view-config';
import { createFormResolver, type FormErrorMap } from './form-resolver';

export interface MainCollectionTableSettingsFormValues {
	smallRows: boolean;
	columnActiveConfig: Record<string, boolean>;
	columnWidthConfig: Record<string, number | undefined>;
}

export interface ModOverrideFormValues {
	overrideId: string;
}

const mainColumnTitleSet = new Set<MainColumnTitles>(Object.values(MainColumnTitles));

function isMainColumnTitle(column: string): column is MainColumnTitles {
	return mainColumnTitleSet.has(column as MainColumnTitles);
}

const mainCollectionTableSettingsSchema = Schema.Struct({
	smallRows: Schema.Boolean,
	columnActiveConfig: Schema.Record(Schema.String, Schema.Boolean),
	columnWidthConfig: Schema.Record(Schema.String, Schema.optional(Schema.Number))
});

const modOverrideFormSchema = Schema.Struct({
	overrideId: Schema.String
});

export const mainCollectionTableSettingsResolver = createFormResolver<MainCollectionTableSettingsFormValues>((values) => {
	try {
		Schema.decodeUnknownSync(mainCollectionTableSettingsSchema)(values);
	} catch {
		return { root: 'Invalid table settings' };
	}

	return Object.entries(values.columnWidthConfig).reduce<Record<string, string>>((errors, [column, width]) => {
		if (width === undefined || !isMainColumnTitle(column)) {
			return errors;
		}

		const minimumWidth = getResolvedMainColumnMinWidth(column);
		if (width < minimumWidth) {
			errors[`columnWidthConfig.${column}`] = `${column} must be at least ${minimumWidth}px wide`;
		}
		return errors;
	}, {});
});

export const modOverrideResolver = createFormResolver<ModOverrideFormValues>((values): FormErrorMap => {
	try {
		Schema.decodeUnknownSync(modOverrideFormSchema)(values);
	} catch {
		return { overrideId: 'Invalid override ID' };
	}

	if (values.overrideId !== values.overrideId.trim()) {
		return { overrideId: 'Remove spaces from the start or end of the override ID' };
	}

	return {};
});

export function createMainTableSettingsFormValues(config?: MainCollectionConfig): MainCollectionTableSettingsFormValues {
	const normalizedConfig = normalizeMainCollectionConfig(config);
	return {
		smallRows: !!normalizedConfig.smallRows,
		columnActiveConfig: normalizedConfig.columnActiveConfig || {},
		columnWidthConfig: normalizedConfig.columnWidthConfig || {}
	};
}

export function setMainTableSettingsColumnWidth(
	values: MainCollectionTableSettingsFormValues,
	column: MainColumnTitles,
	width?: number | null
): MainCollectionTableSettingsFormValues {
	const nextColumnWidthConfig = { ...values.columnWidthConfig };
	if (typeof width === 'number') {
		nextColumnWidthConfig[column] = normalizeMainColumnWidth(column, width);
	} else {
		delete nextColumnWidthConfig[column];
	}

	return {
		...values,
		columnWidthConfig: nextColumnWidthConfig
	};
}

export function toMainCollectionConfig(
	values: MainCollectionTableSettingsFormValues,
	currentConfig?: MainCollectionConfig
): MainCollectionConfig {
	return normalizeMainCollectionConfig({
		...(currentConfig || {}),
		smallRows: values.smallRows || undefined,
		columnActiveConfig: values.columnActiveConfig,
		columnWidthConfig: values.columnWidthConfig as Record<string, number>,
		columnOrder: currentConfig?.columnOrder
	});
}
