import { useCallback } from 'react';
import type { AppConfig, NotificationProps } from 'model';
import type { MainColumnTitles } from 'model';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import type { BlockLookupColumnKey } from 'renderer/state/block-lookup-store';
import { persistConfigChange } from 'renderer/util/config-write';
import type { BlockLookupColumnConfig } from 'renderer/block-lookup-column-definitions';
import { moveBlockLookupColumn, setBlockLookupColumnWidth, setBlockLookupColumns } from 'renderer/block-lookup-view-config-commands';
import {
	moveMainCollectionColumn,
	setMainCollectionColumnVisibility,
	setMainCollectionColumnWidth
} from 'renderer/main-view-config-columns';
import { setMainCollectionDetailsOverlaySize } from 'renderer/main-view-config-size';
import type { NotificationType } from './hooks/collections/useNotifications';

interface PersistViewConfigChangeOptions {
	logger: Pick<Console, 'error'>;
	nextConfig: AppConfig | undefined;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	updateState: CollectionWorkspaceAppState['updateState'];
}

export async function persistViewConfigChange({ logger, nextConfig, openNotification, updateState }: PersistViewConfigChangeOptions) {
	try {
		return await persistConfigChange(nextConfig, (config) => updateState({ config }));
	} catch (error) {
		logger.error(error);
		openNotification(
			{
				message: 'Failed to update view settings',
				placement: 'bottomLeft',
				duration: null
			},
			'error'
		);
		return false;
	}
}

interface ViewConfigCommandsOptions {
	config: AppConfig;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	updateState: CollectionWorkspaceAppState['updateState'];
}

export function useViewConfigCommands({ config, openNotification, updateState }: ViewConfigCommandsOptions) {
	const persist = useCallback(
		(nextConfig: AppConfig | undefined) =>
			persistViewConfigChange({
				logger: api.logger,
				nextConfig,
				openNotification,
				updateState
			}),
		[openNotification, updateState]
	);

	const setMainColumnWidth = useCallback(
		(column: MainColumnTitles, width: number) => persist(setMainCollectionColumnWidth(config, column, width)),
		[config, persist]
	);
	const setMainColumnVisibility = useCallback(
		(column: MainColumnTitles, visible: boolean) => persist(setMainCollectionColumnVisibility(config, column, visible)),
		[config, persist]
	);
	const setMainColumnOrder = useCallback(
		(fromColumn: MainColumnTitles, toColumn: MainColumnTitles) => persist(moveMainCollectionColumn(config, fromColumn, toColumn)),
		[config, persist]
	);
	const setMainDetailsOverlaySize = useCallback(
		(layout: 'side' | 'bottom', size: number | undefined) => persist(setMainCollectionDetailsOverlaySize(config, layout, size)),
		[config, persist]
	);
	const saveBlockLookupColumns = useCallback(
		(columns: BlockLookupColumnConfig[], smallRows: boolean) => persist(setBlockLookupColumns(config, columns, smallRows)),
		[config, persist]
	);
	const setBlockLookupColumnOrder = useCallback(
		(columnConfig: BlockLookupColumnConfig[], fromKey: BlockLookupColumnKey, toKey: BlockLookupColumnKey) =>
			fromKey === toKey ? Promise.resolve(undefined) : persist(moveBlockLookupColumn(config, columnConfig, fromKey, toKey)),
		[config, persist]
	);
	const setBlockLookupColumnWidthCommand = useCallback(
		(columnConfig: BlockLookupColumnConfig[], columnKey: BlockLookupColumnKey, width: number) =>
			persist(setBlockLookupColumnWidth(config, columnConfig, columnKey, width)),
		[config, persist]
	);

	return {
		saveBlockLookupColumns,
		setBlockLookupColumnOrder,
		setBlockLookupColumnWidth: setBlockLookupColumnWidthCommand,
		setMainDetailsOverlaySize,
		setMainColumnOrder,
		setMainColumnVisibility,
		setMainColumnWidth
	};
}
