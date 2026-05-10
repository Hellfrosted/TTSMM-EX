import { z } from 'zod';
import { MainColumnTitles, type MainCollectionConfig } from 'model';
import { getResolvedMainColumnMinWidth } from 'renderer/main-collection-column-layout';
import { normalizeMainCollectionConfig } from 'renderer/view-config-persistence';

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

export const mainCollectionTableSettingsSchema = z
	.object({
		smallRows: z.boolean(),
		columnActiveConfig: z.record(z.string(), z.boolean()),
		columnWidthConfig: z.record(z.string(), z.number().optional())
	})
	.superRefine((values, context) => {
		Object.entries(values.columnWidthConfig).forEach(([column, width]) => {
			if (width === undefined || !isMainColumnTitle(column)) {
				return;
			}

			const minimumWidth = getResolvedMainColumnMinWidth(column);
			if (width < minimumWidth) {
				context.addIssue({
					code: 'custom',
					message: `${column} must be at least ${minimumWidth}px wide`,
					path: ['columnWidthConfig', column]
				});
			}
		});
	});

export const modOverrideFormSchema = z.object({
	overrideId: z.string().refine((overrideId) => overrideId === overrideId.trim(), {
		message: 'Remove spaces from the start or end of the override ID'
	})
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
		nextColumnWidthConfig[column] = Math.max(getResolvedMainColumnMinWidth(column), Math.round(width));
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
