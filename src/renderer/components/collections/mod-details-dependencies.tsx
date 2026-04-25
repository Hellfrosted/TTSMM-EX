import { useState } from 'react';
import type { Key, ReactNode } from 'react';
import StatusCallout from '../StatusCallout';
import { DisplayModData, getModDataDisplayName } from 'model';

type DetailCellRenderer = {
	render(value: DisplayModData[keyof DisplayModData] | undefined, record: DisplayModData, rowIndex: number): ReactNode;
}['render'];

export interface DetailColumn {
	title: ReactNode;
	dataIndex?: string;
	defaultSortOrder?: 'ascend';
	sorter?: (a: DisplayModData, b: DisplayModData) => number;
	render?: DetailCellRenderer;
	width?: number;
	align?: 'center';
}

export interface DetailRowSelection {
	selectedRowKeys: Key[];
	checkStrictly?: boolean;
	onChange: (selectedRowKeys: Key[]) => void;
	onSelect?: (record: DisplayModData, selected: boolean) => void;
	onSelectAll?: () => void;
	onSelectNone?: () => void;
}

interface DependencyCollapseItem {
	key: string;
	label: ReactNode;
	children: ReactNode;
}

interface ModDetailsDependenciesPaneProps {
	conflictingDependencyColumns: DetailColumn[];
	conflictingDependencyRowSelection: DetailRowSelection;
	conflictingModData: DisplayModData[];
	dependencyLookupError?: string;
	dependentDependencyColumns: DetailColumn[];
	dependentDependencyRowSelection: DetailRowSelection;
	dependentModData: DisplayModData[];
	loadingDependencies: boolean;
	onRetryDependencyLookup: () => void;
	requiredDependencyColumns: DetailColumn[];
	requiredDependencyRowSelection: DetailRowSelection;
	requiredModData: DisplayModData[];
}

export function DetailCheckbox({
	'aria-label': ariaLabel,
	checked,
	disabled,
	onChange
}: {
	'aria-label': string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<input
			type="checkbox"
			className="ModDetailCheckbox"
			aria-label={ariaLabel}
			checked={checked}
			disabled={disabled}
			onChange={(event) => {
				onChange(event.target.checked);
			}}
		/>
	);
}

function DependencyActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
	return (
		<button type="button" className="ModDetailButton" onClick={onClick}>
			{children}
		</button>
	);
}

function getRecordValue(record: DisplayModData, dataIndex?: string) {
	return dataIndex ? record[dataIndex as keyof DisplayModData] : undefined;
}

function flattenDetailRows(rows: DisplayModData[]) {
	return rows.flatMap((record) => [
		{ record, depth: 0 },
		...(record.children || []).map((childRecord) => ({ record: childRecord, depth: 1 }))
	]);
}

function DependencyCollapse({
	className = '',
	defaultActiveKey,
	items
}: {
	className?: string;
	defaultActiveKey?: string[];
	items: DependencyCollapseItem[];
}) {
	const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(defaultActiveKey || []));

	return (
		<div className={`ModDetailCollapse${className ? ` ${className}` : ''}`}>
			{items.map((item) => {
				const open = openKeys.has(item.key);
				return (
					<section key={item.key} className="ModDetailCollapseItem">
						<button
							type="button"
							className="ModDetailCollapseHeader"
							aria-expanded={open}
							onClick={() => {
								setOpenKeys((currentKeys) => {
									const nextKeys = new Set(currentKeys);
									if (nextKeys.has(item.key)) {
										nextKeys.delete(item.key);
									} else {
										nextKeys.add(item.key);
									}
									return nextKeys;
								});
							}}
						>
							<span aria-hidden="true">{open ? '▾' : '▸'}</span>
							<span>{item.label}</span>
						</button>
						{open ? <div className="ModDetailCollapsePanel">{item.children}</div> : null}
					</section>
				);
			})}
		</div>
	);
}

function DetailTable({
	columns,
	dataSource,
	loading,
	rowSelection
}: {
	columns: DetailColumn[];
	dataSource: DisplayModData[];
	loading?: boolean;
	rowSelection?: DetailRowSelection;
}) {
	const visibleRows = flattenDetailRows(dataSource);
	const selectedKeys = new Set((rowSelection?.selectedRowKeys || []).map((key) => key.toString()));
	const selectableKeys = visibleRows.map(({ record }) => record.uid);
	const allSelected = selectableKeys.length > 0 && selectableKeys.every((uid) => selectedKeys.has(uid));
	const someSelected = selectableKeys.some((uid) => selectedKeys.has(uid)) && !allSelected;

	const updateSelection = (record: DisplayModData, selected: boolean) => {
		if (!rowSelection) {
			return;
		}

		const nextKeys = new Set(selectedKeys);
		const affectedRecords = record.children && !rowSelection.checkStrictly ? record.children : [record];
		affectedRecords.forEach((affectedRecord) => {
			if (selected) {
				nextKeys.add(affectedRecord.uid);
			} else {
				nextKeys.delete(affectedRecord.uid);
			}
		});
		rowSelection.onSelect?.(record, selected);
		rowSelection.onChange([...nextKeys]);
	};

	return (
		<div className="ModDetailTableWrap">
			<table className="ModDetailTable">
				<thead>
					<tr>
						{rowSelection ? (
							<th className="ModDetailTableSelectionCell">
								<DetailCheckbox
									aria-label="Select all dependency rows"
									checked={allSelected}
									onChange={(checked) => {
										if (checked) {
											rowSelection.onSelectAll?.();
											rowSelection.onChange(selectableKeys);
										} else {
											rowSelection.onSelectNone?.();
											rowSelection.onChange([]);
										}
									}}
								/>
								<span className="sr-only">{someSelected ? 'Some dependency rows selected' : ''}</span>
							</th>
						) : null}
						{columns.map((column, index) => (
							<th key={`${String(column.title)}-${index}`} style={{ width: column.width, textAlign: column.align }}>
								{column.title}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{loading ? (
						<tr>
							<td colSpan={columns.length + (rowSelection ? 1 : 0)} className="ModDetailTableEmpty">
								Loading...
							</td>
						</tr>
					) : null}
					{!loading && visibleRows.length === 0 ? (
						<tr>
							<td colSpan={columns.length + (rowSelection ? 1 : 0)} className="ModDetailTableEmpty">
								No data
							</td>
						</tr>
					) : null}
					{!loading
						? visibleRows.map(({ record, depth }, rowIndex) => (
								<tr key={record.uid}>
									{rowSelection ? (
										<td className="ModDetailTableSelectionCell">
											<DetailCheckbox
												aria-label={`Select dependency row for ${getModDataDisplayName(record) || record.name || record.uid}`}
												checked={selectedKeys.has(record.uid)}
												onChange={(checked) => {
													updateSelection(record, checked);
												}}
											/>
										</td>
									) : null}
									{columns.map((column, columnIndex) => {
										const value = getRecordValue(record, column.dataIndex);
										const rendered = column.render ? column.render(value, record, rowIndex) : (value as ReactNode);
										return (
											<td
												key={`${record.uid}:${columnIndex}`}
												style={{
													width: column.width,
													textAlign: column.align,
													paddingLeft: columnIndex === 0 ? 8 + depth * 18 : undefined
												}}
											>
												{rendered}
											</td>
										);
									})}
								</tr>
							))
						: null}
				</tbody>
			</table>
		</div>
	);
}

export function ModDetailsDependenciesPane({
	conflictingDependencyColumns,
	conflictingDependencyRowSelection,
	conflictingModData,
	dependencyLookupError,
	dependentDependencyColumns,
	dependentDependencyRowSelection,
	dependentModData,
	loadingDependencies,
	onRetryDependencyLookup,
	requiredDependencyColumns,
	requiredDependencyRowSelection,
	requiredModData
}: ModDetailsDependenciesPaneProps) {
	return (
		<div className="ModDetailDependenciesPane">
			{dependencyLookupError ? (
				<div className="ModDetailDependencyError">
					<StatusCallout tone="warning" heading="Workshop dependency refresh failed">
						{dependencyLookupError}
					</StatusCallout>
					<DependencyActionButton onClick={onRetryDependencyLookup}>Retry Workshop Dependency Lookup</DependencyActionButton>
				</div>
			) : null}
			<DependencyCollapse
				className="ModDetailDependencies"
				defaultActiveKey={['required']}
				items={[
					{
						key: 'required',
						label: 'Required mods:',
						children: (
							<DetailTable
								loading={loadingDependencies}
								dataSource={requiredModData}
								rowSelection={requiredDependencyRowSelection}
								columns={requiredDependencyColumns}
							/>
						)
					},
					{
						key: 'dependent',
						label: 'Dependent mods:',
						children: (
							<DetailTable
								dataSource={dependentModData}
								rowSelection={dependentDependencyRowSelection}
								columns={dependentDependencyColumns}
							/>
						)
					},
					{
						key: 'conflict',
						label: 'Conflicting mods:',
						children: (
							<DetailTable
								dataSource={conflictingModData}
								rowSelection={conflictingDependencyRowSelection}
								columns={conflictingDependencyColumns}
							/>
						)
					}
				]}
			/>
		</div>
	);
}
