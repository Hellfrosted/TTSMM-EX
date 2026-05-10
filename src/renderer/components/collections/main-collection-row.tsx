import { memo, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DisplayModData, getModDataDisplayName } from 'model';
import { formatDateStr } from 'util/Date';
import { VirtualTableRow } from 'renderer/components/virtual-table-primitives';
import { DEFAULT_SELECTION_COLUMN_WIDTH, getMainCollectionVirtualColumnStyle } from './main-collection-table-layout';

interface MainCollectionCellRenderContext {
	activateRow: () => void;
	detailsOpen?: boolean;
	highlighted?: boolean;
	openDetails: () => void;
}

export type MainCollectionCellRenderer = {
	render(
		value: DisplayModData[keyof DisplayModData],
		record: DisplayModData,
		rowIndex: number,
		context: MainCollectionCellRenderContext
	): ReactNode;
}['render'];

export interface MainCollectionRowColumn {
	title: string;
	dataIndex: string;
	className?: string;
	align?: 'left' | 'center' | 'right';
	width?: number | string;
	render?: MainCollectionCellRenderer;
	onCell?: (record: DisplayModData, index?: number) => { style?: CSSProperties; 'data-column-title'?: string };
}

interface SelectionCheckboxProps {
	'aria-label': string;
	checked: boolean;
	indeterminate?: boolean;
	onChange: (checked: boolean) => void;
}

export function SelectionCheckbox({ 'aria-label': ariaLabel, checked, indeterminate, onChange }: SelectionCheckboxProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.indeterminate = !!indeterminate;
		}
	}, [indeterminate]);

	return (
		<input
			ref={inputRef}
			type="checkbox"
			className="MainCollectionSelectionCheckbox"
			aria-label={ariaLabel}
			checked={checked}
			onClick={(event) => {
				event.stopPropagation();
			}}
			onChange={(event) => {
				onChange(event.target.checked);
			}}
		/>
	);
}

export function getMainCollectionCellContent(
	column: MainCollectionRowColumn,
	record: DisplayModData,
	rowIndex: number,
	context: MainCollectionCellRenderContext
): ReactNode {
	const value = record[column.dataIndex as keyof DisplayModData];
	if (column.render) {
		return column.render(value, record, rowIndex, context);
	}

	if (value instanceof Date) {
		return formatDateStr(value);
	}

	return value as ReactNode;
}

function getBodyCellProps(column: MainCollectionRowColumn, record: DisplayModData) {
	return column.onCell?.(record, 0);
}

function MainCollectionCellValue({
	activateRow,
	column,
	detailsOpen,
	highlighted,
	openDetails,
	record,
	rowIndex
}: {
	activateRow: () => void;
	column: MainCollectionRowColumn;
	detailsOpen?: boolean;
	highlighted?: boolean;
	openDetails: () => void;
	record: DisplayModData;
	rowIndex: number;
}) {
	return <>{getMainCollectionCellContent(column, record, rowIndex, { activateRow, detailsOpen, highlighted, openDetails })}</>;
}

interface MainCollectionVirtualRowProps {
	columns: MainCollectionRowColumn[];
	highlighted: boolean;
	detailsOpen?: boolean;
	measureElement?: (element: HTMLTableRowElement | null) => void;
	record: DisplayModData;
	rowIndex: number;
	selected: boolean;
	small?: boolean;
	start: number;
	tableWidth: number;
	onContextMenu: () => void;
	onOpenDetails: (record: DisplayModData) => void;
	onRowHighlight: (record: DisplayModData) => void;
	onSelectedChange: (record: DisplayModData, selected: boolean) => void;
}

export const MainCollectionVirtualRow = memo(function MainCollectionVirtualRow({
	columns,
	detailsOpen,
	highlighted,
	measureElement,
	record,
	rowIndex,
	selected,
	small,
	start,
	tableWidth,
	onContextMenu,
	onOpenDetails,
	onRowHighlight,
	onSelectedChange
}: MainCollectionVirtualRowProps) {
	const activateRow = () => {
		if (detailsOpen) {
			onOpenDetails(record);
			return;
		}
		onRowHighlight(record);
	};
	const openDetails = () => {
		onOpenDetails(record);
	};
	const rowLabel = getModDataDisplayName(record) || record.uid;

	return (
		<VirtualTableRow
			className={`MainCollectionVirtualRow${small ? ' CompactModRow' : ''}${highlighted ? ' is-selected' : ''}`}
			dataIndex={rowIndex}
			measureElement={measureElement}
			rowHeight={small ? 34 : 48}
			start={start}
			width={tableWidth}
			aria-label={`Mod row for ${rowLabel}. Press Enter or Space to select the row.`}
			aria-selected={highlighted}
			onContextMenu={onContextMenu}
			onDoubleClick={openDetails}
			onActivate={activateRow}
		>
			<td
				className="MainCollectionVirtualCell MainCollectionVirtualSelectionCell"
				style={getMainCollectionVirtualColumnStyle(DEFAULT_SELECTION_COLUMN_WIDTH)}
			>
				<SelectionCheckbox
					aria-label={`Include ${getModDataDisplayName(record) || record.uid} in collection`}
					checked={selected}
					onChange={(checked) => {
						onSelectedChange(record, checked);
					}}
				/>
			</td>
			{columns.map((column) => {
				const bodyCellProps = getBodyCellProps(column, record);
				const widthStyle = bodyCellProps?.style?.width ?? column.width;
				const alignment = column.align ?? 'center';
				return (
					<td
						key={`${record.uid}:${column.title}`}
						className={`MainCollectionVirtualCell MainCollectionVirtualCell--align-${alignment} ${column.className || ''}`}
						data-column-title={column.title}
						style={{
							...(bodyCellProps?.style || {}),
							...getMainCollectionVirtualColumnStyle(widthStyle || 120),
							textAlign: alignment
						}}
					>
						<MainCollectionCellValue
							activateRow={activateRow}
							column={column}
							highlighted={highlighted}
							openDetails={openDetails}
							record={record}
							rowIndex={rowIndex}
						/>
					</td>
				);
			})}
			<td className="MainCollectionVirtualCell MainCollectionVirtualFillerCell" aria-hidden="true" />
		</VirtualTableRow>
	);
});
