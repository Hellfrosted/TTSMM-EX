import { type AppConfig, type BlockLookupColumnKey } from 'model';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { blockLookupColumnsToConfig, getConfiguredBlockLookupColumns } from './block-lookup-column-config';
import { type BlockLookupColumnConfig } from './block-lookup-column-definitions';
import { moveBlockLookupColumnByKey } from './block-lookup-draft-config';

export function setBlockLookupColumnWidth(
	config: AppConfig,
	columns: BlockLookupColumnConfig[],
	columnKey: BlockLookupColumnKey,
	width: number
) {
	const nextColumns = columns.map((column) => (column.key === columnKey ? { ...column, width } : column));
	const nextConfig = cloneAppConfig(config);
	nextConfig.viewConfigs.blockLookup = blockLookupColumnsToConfig(nextColumns, config.viewConfigs.blockLookup?.smallRows);
	return nextConfig;
}

export function setBlockLookupColumns(config: AppConfig, columns: BlockLookupColumnConfig[], smallRows?: boolean) {
	const nextConfig = cloneAppConfig(config);
	const nextColumns = columns.some((column) => column.visible) ? columns : getConfiguredBlockLookupColumns();
	nextConfig.viewConfigs.blockLookup = blockLookupColumnsToConfig(nextColumns, smallRows);
	return nextConfig;
}

export function moveBlockLookupColumn(
	config: AppConfig,
	columns: BlockLookupColumnConfig[],
	fromKey: BlockLookupColumnKey,
	toKey: BlockLookupColumnKey
) {
	const nextColumns = moveBlockLookupColumnByKey(columns, fromKey, toKey);
	if (nextColumns === columns) {
		return undefined;
	}

	return setBlockLookupColumns(config, nextColumns, config.viewConfigs.blockLookup?.smallRows);
}
