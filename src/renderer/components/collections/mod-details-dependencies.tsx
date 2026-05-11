import { DisplayModData, getModDataDisplayName } from 'model';
import type { Key, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import StatusCallout from '../StatusCallout';

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
	dependencyLookupNotice?: string;
	dependentDependencyColumns: DetailColumn[];
	dependentDependencyRowSelection: DetailRowSelection;
	dependentModData: DisplayModData[];
	loadingDependencies: boolean;
	onRetryDependencyLookup: () => void;
	requiredDependencyColumns: DetailColumn[];
	requiredEmptyText?: string;
	requiredDependencyRowSelection: DetailRowSelection;
	requiredModData: DisplayModData[];
}

export function DetailCheckbox({
	'aria-label': ariaLabel,
	checked,
	disabled,
	indeterminate,
	onChange
}: {
	'aria-label': string;
	checked: boolean;
	disabled?: boolean;
	indeterminate?: boolean;
	onChange: (checked: boolean) => void;
}) {
	const checkboxRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (checkboxRef.current) {
			checkboxRef.current.indeterminate = !!indeterminate;
		}
	}, [indeterminate]);

	return (
		<label className="DesktopCheckboxTarget">
			<input
				ref={checkboxRef}
				type="checkbox"
				className="DesktopCheckboxInput ModDetailCheckbox"
				aria-label={ariaLabel}
				aria-checked={indeterminate ? 'mixed' : checked}
				checked={checked}
				disabled={disabled}
				onChange={(event) => {
					onChange(event.target.checked);
				}}
			/>
			<span className="DesktopCheckboxBox" aria-hidden="true" />
		</label>
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

function getRecordSelectionKeys(record: DisplayModData, rowSelection?: DetailRowSelection) {
	if (record.children && !rowSelection?.checkStrictly) {
		return record.children.map((childRecord) => childRecord.uid);
	}

	return [record.uid];
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
	emptyText = 'No data',
	loading,
	rowSelection
}: {
	columns: DetailColumn[];
	dataSource: DisplayModData[];
	emptyText?: string;
	loading?: boolean;
	rowSelection?: DetailRowSelection;
}) {
	const visibleRows = flattenDetailRows(dataSource);
	const selectedKeys = new Set((rowSelection?.selectedRowKeys || []).map((key) => key.toString()));
	const selectableKeys = [...new Set(visibleRows.flatMap(({ record }) => getRecordSelectionKeys(record, rowSelection)))];
	const allSelected = selectableKeys.length > 0 && selectableKeys.every((uid) => selectedKeys.has(uid));
	const someSelected = selectableKeys.some((uid) => selectedKeys.has(uid)) && !allSelected;

	const updateSelection = (record: DisplayModData, selected: boolean) => {
		if (!rowSelection) {
			return;
		}

		const nextKeys = new Set(selectedKeys);
		const affectedKeys = getRecordSelectionKeys(record, rowSelection);
		affectedKeys.forEach((affectedKey) => {
			if (selected) {
				nextKeys.add(affectedKey);
			} else {
				nextKeys.delete(affectedKey);
			}
		});
		rowSelection.onSelect?.(record, selected);
		rowSelection.onChange([...nextKeys]);
	};

	return (
		<div className="ModDetailTableWrap">
			<table className="ModDetailTable" aria-busy={loading ? 'true' : undefined}>
				<thead>
					<tr>
						{rowSelection ? (
							<th className="ModDetailTableSelectionCell">
								<DetailCheckbox
									aria-label={`Select all ${selectableKeys.length} dependency row${selectableKeys.length === 1 ? '' : 's'}`}
									checked={allSelected}
									disabled={selectableKeys.length === 0}
									indeterminate={someSelected}
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
						{columns.map((column) => (
							<th key={String(column.dataIndex ?? column.title)} style={{ width: column.width, textAlign: column.align }}>
								{column.title}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{loading ? (
						<tr>
							<td colSpan={columns.length + (rowSelection ? 1 : 0)} className="ModDetailTableEmpty">
								Refreshing dependency data…
							</td>
						</tr>
					) : null}
					{!loading && visibleRows.length === 0 ? (
						<tr>
							<td colSpan={columns.length + (rowSelection ? 1 : 0)} className="ModDetailTableEmpty">
								{emptyText}
							</td>
						</tr>
					) : null}
					{!loading
						? visibleRows.map(({ record, depth }, rowIndex) => (
								<tr key={record.uid}>
									{rowSelection ? (
										<td className="ModDetailTableSelectionCell">
											{(() => {
												const recordSelectionKeys = getRecordSelectionKeys(record, rowSelection);
												const recordSelected = recordSelectionKeys.length > 0 && recordSelectionKeys.every((uid) => selectedKeys.has(uid));
												const recordIndeterminate = recordSelectionKeys.some((uid) => selectedKeys.has(uid)) && !recordSelected;

												return (
													<DetailCheckbox
														aria-label={`Select dependency row for ${getModDataDisplayName(record) || record.name || record.uid}`}
														checked={recordSelected}
														indeterminate={recordIndeterminate}
														onChange={(checked) => {
															updateSelection(record, checked);
														}}
													/>
												);
											})()}
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
	dependencyLookupNotice,
	dependentDependencyColumns,
	dependentDependencyRowSelection,
	dependentModData,
	loadingDependencies,
	onRetryDependencyLookup,
	requiredDependencyColumns,
	requiredEmptyText,
	requiredDependencyRowSelection,
	requiredModData
}: ModDetailsDependenciesPaneProps) {
	const showNeutralDependencyCheck =
		!loadingDependencies && !dependencyLookupError && !dependencyLookupNotice && !!requiredEmptyText && requiredModData.length === 0;

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
			{dependencyLookupNotice ? (
				<div className="ModDetailDependencyNotice">
					<span>{dependencyLookupNotice}</span>
					<DependencyActionButton onClick={onRetryDependencyLookup}>Check again</DependencyActionButton>
				</div>
			) : null}
			{showNeutralDependencyCheck ? (
				<div className="ModDetailDependencyNotice">
					<span>Workshop dependency data can be rechecked if the author changed it recently.</span>
					<DependencyActionButton onClick={onRetryDependencyLookup}>Check again</DependencyActionButton>
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
								emptyText={requiredEmptyText}
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
