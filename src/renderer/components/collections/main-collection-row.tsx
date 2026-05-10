import { memo, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DisplayModData, getModDataDisplayName } from 'model';
import { formatDateStr } from 'util/Date';
import { DEFAULT_SELECTION_COLUMN_WIDTH } from './main-collection-table-layout';

export type MainCollectionCellRenderer = {
	render(value: DisplayModData[keyof DisplayModData], record: DisplayModData, rowIndex: number): ReactNode;
}['render'];

export interface MainCollectionRowColumn {
	title: string;
	dataIndex: string;
	className?: string;
	align?: 'center';
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
			onChange={(event) => {
				onChange(event.target.checked);
			}}
		/>
	);
}

export function renderMainCollectionCellValue(column: MainCollectionRowColumn, record: DisplayModData, rowIndex: number): ReactNode {
	const value = record[column.dataIndex as keyof DisplayModData];
	if (column.render) {
		return column.render(value, record, rowIndex);
	}

	if (value instanceof Date) {
		return formatDateStr(value);
	}

	return value as ReactNode;
}

function getBodyCellProps(column: MainCollectionRowColumn, record: DisplayModData) {
	return column.onCell?.(record, 0);
}

interface MainCollectionVirtualRowProps {
	columns: MainCollectionRowColumn[];
	measureElement: (element: HTMLTableRowElement | null) => void;
	record: DisplayModData;
	rowId: string;
	rowIndex: number;
	selected: boolean;
	small?: boolean;
	start: number;
	onContextMenu: () => void;
	onSelectedChange: (record: DisplayModData, selected: boolean) => void;
}

export const MainCollectionVirtualRow = memo(function MainCollectionVirtualRow({
	columns,
	measureElement,
	record,
	rowId,
	rowIndex,
	selected,
	small,
	start,
	onContextMenu,
	onSelectedChange
}: MainCollectionVirtualRowProps) {
	return (
		<tr
			key={rowId}
			ref={measureElement}
			data-index={rowIndex}
			className={`MainCollectionVirtualRow${small ? ' CompactModRow' : ''}`}
			style={{ transform: `translateY(${start}px)` }}
			onContextMenu={onContextMenu}
		>
			<td className="MainCollectionVirtualCell MainCollectionVirtualSelectionCell" style={{ width: DEFAULT_SELECTION_COLUMN_WIDTH }}>
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
				return (
					<td
						key={`${record.uid}:${column.title}`}
						className={`MainCollectionVirtualCell ${column.className || ''}`}
						data-column-title={column.title}
						style={{
							...(bodyCellProps?.style || {}),
							width: widthStyle,
							textAlign: column.align
						}}
					>
						{renderMainCollectionCellValue(column, record, rowIndex)}
					</td>
				);
			})}
		</tr>
	);
});
