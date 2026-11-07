import type { AppConfig } from 'model';
import { useCallback } from 'react';
import type { BlockLookupColumnConfig } from './block-lookup-column-definitions';
import type { BlockLookupColumnKey } from './block-lookup-table-workspace';
import { moveBlockLookupColumn, setBlockLookupColumns, setBlockLookupColumnWidth } from './block-lookup-view-config-commands';
import { useViewConfigPersistence, type ViewConfigPersistenceOptions } from './view-config-command';

export function useBlockLookupViewConfigCommands({ config, ...persistence }: ViewConfigPersistenceOptions & { config: AppConfig }) {
	const persist = useViewConfigPersistence(persistence);
	const saveBlockLookupColumns = useCallback(
		(columns: BlockLookupColumnConfig[], smallRows: boolean) => persist(setBlockLookupColumns(config, columns, smallRows), config),
		[config, persist]
	);
	const setBlockLookupColumnOrder = useCallback(
		(columnConfig: BlockLookupColumnConfig[], fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) =>
			fromKey === toKey ? Promise.resolve(undefined) : persist(moveBlockLookupColumn(config, columnConfig, fromKey, toKey), config),
		[config, persist]
	);
	const setBlockLookupColumnWidthCommand = useCallback(
		(columnConfig: BlockLookupColumnConfig[], columnKey: BlockLookupColumnKey, width: number) =>
			persist(setBlockLookupColumnWidth(config, columnConfig, columnKey, width), config),
		[config, persist]
	);
	return { saveBlockLookupColumns, setBlockLookupColumnOrder, setBlockLookupColumnWidth: setBlockLookupColumnWidthCommand };
}
