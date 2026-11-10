import type { AppConfig, MainColumnTitles } from 'model';
import { useCallback } from 'react';
import { moveMainCollectionColumn, setMainCollectionColumnVisibility, setMainCollectionColumnWidth } from './main-view-config-columns';
import { setMainCollectionDetailsOverlaySize } from './main-view-config-size';
import { useViewConfigPersistence, type ViewConfigPersistenceOptions } from './view-config-command';

export function useMainViewConfigCommands({ config, ...persistence }: ViewConfigPersistenceOptions & { config: AppConfig }) {
	const persist = useViewConfigPersistence(persistence);
	const setMainColumnWidth = useCallback(
		(column: MainColumnTitles, width: number) => persist(setMainCollectionColumnWidth(config, column, width), config),
		[config, persist]
	);
	const setMainColumnVisibility = useCallback(
		(column: MainColumnTitles, visible: boolean) => persist(setMainCollectionColumnVisibility(config, column, visible), config),
		[config, persist]
	);
	const setMainColumnOrder = useCallback(
		(fromColumn: MainColumnTitles, toColumn: MainColumnTitles) => persist(moveMainCollectionColumn(config, fromColumn, toColumn), config),
		[config, persist]
	);
	const setMainDetailsOverlaySize = useCallback(
		(layout: 'side' | 'bottom', size: number | undefined) => persist(setMainCollectionDetailsOverlaySize(config, layout, size), config),
		[config, persist]
	);
	return { setMainColumnWidth, setMainColumnVisibility, setMainColumnOrder, setMainDetailsOverlaySize };
}
