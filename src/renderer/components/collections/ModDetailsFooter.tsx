import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Key, type ReactNode } from 'react';
import {
	CheckSquare,
	CircleHelp,
	Clock3,
	Edit3,
	FolderOpen,
	HardDrive,
	LoaderCircle,
	Maximize2,
	Minimize2,
	PanelBottom,
	PanelRight,
	TriangleAlert,
	X
} from 'lucide-react';
import api from 'renderer/Api';
import {
	DisplayModData,
	getDescriptor,
	getModDescriptorDisplayName,
	getModDescriptorKey,
	getModDataDisplayName,
	ModCollection,
	ModErrors,
	ModErrorType,
	ModType,
	NotificationProps,
	getModDataDisplayId,
	getModDataId,
	compareModDataDisplayName,
	compareModDataDisplayId,
	CollectionManagerModalType
} from 'model';
import { isWorkshopDependencyLookupStale } from 'shared/workshop-dependency-lookup';
import { formatDateStr } from 'util/Date';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { writeConfig } from 'renderer/util/config-write';
import { WorkshopDescription } from 'renderer/util/workshop-description';
import { APP_TAG_STYLES } from 'renderer/theme';

import missing from '../../../../assets/missing.png';
import steam from '../../../../assets/steam.png';
import ttmm from '../../../../assets/ttmm.png';

const EMPTY_MOD_DESCRIPTORS: NonNullable<DisplayModData['dependsOn']> = [];

type DetailCellRenderer = {
	render(value: DisplayModData[keyof DisplayModData] | undefined, record: DisplayModData, rowIndex: number): ReactNode;
}['render'];

interface DetailColumn {
	title: ReactNode;
	dataIndex?: string;
	defaultSortOrder?: 'ascend';
	sorter?: (a: DisplayModData, b: DisplayModData) => number;
	render?: DetailCellRenderer;
	width?: number;
	align?: 'center';
}

interface DetailRowSelection {
	selectedRowKeys: Key[];
	checkStrictly?: boolean;
	onChange: (selectedRowKeys: Key[]) => void;
	onSelect?: (record: DisplayModData, selected: boolean) => void;
	onSelectAll?: () => void;
	onSelectNone?: () => void;
}

interface DetailDescriptionItem {
	label: ReactNode;
	children: ReactNode;
	span?: number;
}

interface DetailCollapseItem {
	key: string;
	label: ReactNode;
	children: ReactNode;
}

interface DetailTabItem {
	key: string;
	label: ReactNode;
	children: ReactNode;
}

function DetailTag({ children, style }: { children: ReactNode; style?: CSSProperties }) {
	return (
		<span className="ModDetailTag" style={style}>
			{children}
		</span>
	);
}

function DetailIcon({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
	return (
		<span className={`ModDetailIcon${className ? ` ${className}` : ''}`} role="img" aria-label={label} title={label}>
			{children}
		</span>
	);
}

function DetailIconButton({
	'aria-label': ariaLabel,
	'aria-pressed': ariaPressed,
	children,
	onClick,
	title
}: {
	'aria-label': string;
	'aria-pressed'?: boolean;
	children: ReactNode;
	onClick: () => void;
	title?: string;
}) {
	return (
		<button
			type="button"
			className="ModDetailIconButton"
			aria-label={ariaLabel}
			aria-pressed={ariaPressed}
			title={title}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function DetailButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
	return (
		<button type="button" className="ModDetailButton" onClick={onClick}>
			{children}
		</button>
	);
}

function DetailCheckbox({
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

function DetailDescriptions({ column = 1, items }: { column?: number; items: DetailDescriptionItem[] }) {
	return (
		<div className={`ModDetailDescriptions ModDetailDescriptions--columns-${column}`}>
			{items.map((item, index) => (
				<div
					key={`${String(item.label)}-${index}`}
					className="ModDetailDescriptionsItem"
					style={{ gridColumn: item.span ? `span ${item.span}` : undefined }}
				>
					<div className="ModDetailDescriptionsLabel">{item.label}</div>
					<div className="ModDetailDescriptionsValue">{item.children}</div>
				</div>
			))}
		</div>
	);
}

function DetailCollapse({ className = '', defaultActiveKey, items }: { className?: string; defaultActiveKey?: string[]; items: DetailCollapseItem[] }) {
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

function DetailTabs({ activeKey, items, onChange }: { activeKey: string; items: DetailTabItem[]; onChange: (key: string) => void }) {
	return (
		<div className="ModDetailFooterTabs">
			<div className="ModDetailTabsNav" role="tablist">
				{items.map((item) => (
					<button
						key={item.key}
						type="button"
						className={`ModDetailTabButton${activeKey === item.key ? ' is-active' : ''}`}
						role="tab"
						aria-selected={activeKey === item.key}
						onClick={() => {
							onChange(item.key);
						}}
					>
						{item.label}
					</button>
				))}
			</div>
			<div className="ModDetailTabsPanel" role="tabpanel">
				{items.find((item) => item.key === activeKey)?.children}
			</div>
		</div>
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
							<th
								key={`${String(column.title)}-${index}`}
								style={{ width: column.width, textAlign: column.align }}
							>
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

function getModTypeLabel(type: ModType) {
	switch (type) {
		case ModType.LOCAL:
			return 'Local mod';
		case ModType.TTQMM:
			return 'TTMM mod';
		case ModType.WORKSHOP:
			return 'Steam Workshop mod';
		default:
			return 'Mod';
	}
}

function getImageSrcFromType(type: ModType, size = 15) {
	const label = getModTypeLabel(type);
	switch (type) {
		case ModType.LOCAL:
			return (
				<DetailIcon label={label}>
					<HardDrive size={size} aria-hidden="true" />
				</DetailIcon>
			);
		case ModType.TTQMM:
			return <img src={ttmm} width={size} alt={label} title={label} key="type" />;
		case ModType.WORKSHOP:
			return <img src={steam} width={size} alt={label} title={label} key="type" />;
		default:
			return null;
	}
}

function getImagePreview(path?: string, altText = 'Mod preview image') {
	return (
		<div className="ModDetailFooterPreview">
			<img
				src={path || missing}
				alt={altText}
				onError={(event) => {
					event.currentTarget.src = missing;
				}}
			/>
		</div>
	);
}

enum DependenciesTableType {
	REQUIRED = 0,
	DEPENDENT = 1,
	CONFLICT = 2
}

function getRequiredDependencyKey(record: DisplayModData) {
	if (record.type !== ModType.DESCRIPTOR) {
		return getModDataId(record);
	}
	if (record.id) {
		return record.id;
	}
	if (record.workshopID !== undefined) {
		return `${ModType.WORKSHOP}:${record.workshopID.toString()}`;
	}
	return undefined;
}

function getDependencySelectionKeys(data: DisplayModData[]): string[] {
	const availableKeys = new Set<string>();
	data.forEach((record) => {
		availableKeys.add(record.uid);
		record.children?.forEach((childRecord) => {
			availableKeys.add(childRecord.uid);
		});
	});
	return [...availableKeys];
}

interface ModDetailsFooterProps {
	bigDetails: boolean;
	halfLayoutMode: 'bottom' | 'side';
	lastValidationStatus?: boolean;
	appState: CollectionWorkspaceAppState;
	currentRecord: DisplayModData;
	activeTabKey: string;
	setActiveTabKey: (key: string) => void;
	expandFooterCallback: (expand: boolean) => void;
	toggleHalfLayoutCallback: () => void;
	closeFooterCallback: () => void;
	enableModCallback: (uid: string) => void;
	disableModCallback: (uid: string) => void;
	setModSubsetCallback: (changes: { [uid: string]: boolean }) => void;
	openNotification: (props: NotificationProps, type?: 'info' | 'error' | 'success' | 'warn') => void;
	validateCollection: (options?: { config?: CollectionWorkspaceAppState['config'] }) => void;
	openModal: (modalType: CollectionManagerModalType) => void;
}

const NAME_SCHEMA: DetailColumn = {
	title: 'Name',
	dataIndex: 'name',
	defaultSortOrder: 'ascend',
	sorter: compareModDataDisplayName,
	render: (_name: string, record: DisplayModData) => {
		const displayName = getModDataDisplayName(record) || record.uid;
		if (record.type === ModType.DESCRIPTOR && record.children && record.children.length > 0) {
			return (
				<span>
					<FolderOpen size={15} aria-hidden="true" /> {displayName}
				</span>
			);
		}
		let updateIcon = null;
		let updateTone: 'danger' | 'warning' | undefined;
		if (record.needsUpdate) {
			updateIcon = (
				<DetailIcon label="Needs update" className="ModDetailIcon--danger">
					<TriangleAlert size={15} aria-hidden="true" />
				</DetailIcon>
			);
			updateTone = 'danger';
			if (record.downloadPending) {
				updateIcon = (
					<DetailIcon label="Download pending" className="ModDetailIcon--warning">
						<Clock3 size={15} aria-hidden="true" />
					</DetailIcon>
				);
				updateTone = 'warning';
			}
			if (record.downloading) {
				updateIcon = (
					<DetailIcon label="Downloading" className="ModDetailIcon--warning ModDetailIcon--spin">
						<LoaderCircle size={15} aria-hidden="true" />
					</DetailIcon>
				);
				updateTone = 'warning';
			}
		}
		return (
			<span>
				{updateIcon}
				<span className={`ModDetailNameLabel${record.needsUpdate ? ' is-strong' : ''}${updateTone ? ` is-${updateTone}` : ''}`}>
					{` ${displayName}`}
				</span>
			</span>
		);
	}
};

const TYPE_SCHEMA: DetailColumn = {
	title: 'Type',
	dataIndex: 'type',
	render: (type: ModType) => getImageSrcFromType(type, 20),
	width: 65,
	align: 'center'
};

const AUTHORS_SCHEMA: DetailColumn = {
	title: 'Authors',
	dataIndex: 'authors',
	defaultSortOrder: 'ascend',
	sorter: (a, b) => {
		const v1 = a;
		const v2 = b;
		if (v1.authors) {
			if (v2.authors) {
				const l1 = v1.authors.length;
				const l2 = v2.authors.length;
				let ind = 0;
				while (ind < l1 && ind < l2) {
					if (v1.authors[ind] > v2.authors[ind]) {
						return 1;
					}
					if (v1.authors[ind] < v2.authors[ind]) {
						return -1;
					}
					ind += 1;
				}
				if (l1 > l2) {
					return 1;
				}
				if (l1 < l2) {
					return -1;
				}
				return 0;
			}
			return 1;
		}
		return -1;
	},
	render: (authors: string[] | undefined) => {
		return (authors || []).map((author) => <DetailTag key={author}>{author}</DetailTag>);
	}
};

const ID_SCHEMA: DetailColumn = {
	title: 'ID',
	dataIndex: 'id',
	sorter: compareModDataDisplayId,
	render: (_: string | null, record: DisplayModData) => {
		const displayID = getModDataDisplayId(record);
		if (!displayID) {
			return null;
		}
		if (record.workshopID === undefined && record.overrides?.id) {
			return <DetailTag style={APP_TAG_STYLES.neutral}>{displayID}</DetailTag>;
		}
		return displayID;
	}
};

function ModDetailsFooter({
	appState,
	bigDetails,
	halfLayoutMode,
	currentRecord,
	activeTabKey,
	setActiveTabKey,
	closeFooterCallback,
	expandFooterCallback,
	toggleHalfLayoutCallback,
	enableModCallback,
	disableModCallback,
	setModSubsetCallback,
	openNotification,
	validateCollection,
	openModal,
	lastValidationStatus
}: ModDetailsFooterProps) {
	const requestedDependencyLookupUidRef = useRef<string | null>(null);
	const [loadingDependencies, setLoadingDependencies] = useState(false);
	const [dependencyLookupError, setDependencyLookupError] = useState<string>();
	const { activeCollection, config: appConfig, updateState: updateAppState } = appState;
	const currentRecordUid = currentRecord.uid;
	const currentRecordType = currentRecord.type;
	const currentRecordWorkshopID = currentRecord.workshopID;
	const currentRecordSteamDependencies = currentRecord.steamDependencies;
	const currentRecordSteamDependenciesFetchedAt = currentRecord.steamDependenciesFetchedAt;

	useEffect(() => {
		if (requestedDependencyLookupUidRef.current === null) {
			return;
		}

		if (activeTabKey === 'dependencies' && requestedDependencyLookupUidRef.current === currentRecordUid) {
			return;
		}

		requestedDependencyLookupUidRef.current = null;
		setLoadingDependencies(false);
	}, [activeTabKey, currentRecordUid]);

	useEffect(() => {
		setDependencyLookupError(undefined);
	}, [currentRecordUid]);

	useEffect(() => {
		if (activeTabKey !== 'dependencies') {
			setDependencyLookupError(undefined);
		}
	}, [activeTabKey]);

	useEffect(() => {
		const shouldRefreshWorkshopDependencies =
			currentRecordSteamDependencies === undefined ||
			isWorkshopDependencyLookupStale(currentRecordSteamDependenciesFetchedAt);

		if (
			activeTabKey !== 'dependencies' ||
			currentRecordType !== ModType.WORKSHOP ||
			currentRecordWorkshopID === undefined ||
			!shouldRefreshWorkshopDependencies ||
			requestedDependencyLookupUidRef.current === currentRecordUid ||
			!!dependencyLookupError
		) {
			return;
		}

		let cancelled = false;
		const loadDependencies = async () => {
			if (currentRecordWorkshopID === undefined) {
				return;
			}

			const message = 'Could not refresh the Workshop dependency list for this mod. Retry to use the latest author-defined dependency data.';
			requestedDependencyLookupUidRef.current = currentRecordUid;
			setLoadingDependencies(true);
			try {
				const loaded = await api.fetchWorkshopDependencies(currentRecordWorkshopID);
				if (!loaded) {
					api.logger.warn(message);
					if (!cancelled) {
						setDependencyLookupError(message);
					}
					return;
				}
				if (!cancelled) {
					setDependencyLookupError(undefined);
				}
			} catch (error) {
				api.logger.error(message);
				api.logger.error(error);
				if (!cancelled) {
					setDependencyLookupError(message);
				}
			} finally {
				if (!cancelled) {
					requestedDependencyLookupUidRef.current = null;
					setLoadingDependencies(false);
				}
			}
		};

		void loadDependencies();

		return () => {
			cancelled = true;
			if (requestedDependencyLookupUidRef.current === currentRecordUid) {
				requestedDependencyLookupUidRef.current = null;
				setLoadingDependencies(false);
			}
		};
	}, [
		activeTabKey,
		currentRecordUid,
		currentRecordType,
		currentRecordWorkshopID,
		currentRecordSteamDependencies,
		currentRecordSteamDependenciesFetchedAt,
		dependencyLookupError
	]);

	const getIgnoredRenderer = useCallback((type: DependenciesTableType) => {
		const { uid: currentRecordUid } = currentRecord;
		const ignoreBadValidation = appConfig.ignoredValidationErrors;

		let errorType: ModErrorType | undefined;
		switch (type) {
			case DependenciesTableType.REQUIRED:
				errorType = ModErrorType.MISSING_DEPENDENCIES;
				break;
			case DependenciesTableType.CONFLICT:
				errorType = ModErrorType.INCOMPATIBLE_MODS;
				break;
		}

		if (!errorType) {
			return undefined;
		}

		return (_: unknown, record: DisplayModData) => {
			const ignoredErrors = ignoreBadValidation.get(errorType as ModErrorType);
			const myIgnoredErrors = ignoredErrors ? ignoredErrors[currentRecordUid] || [] : [];
			const dependencyKey = getRequiredDependencyKey(record);
			const { name: recordName, type: recordType, uid: recordUid } = record;
			const isSelected =
				(type === DependenciesTableType.REQUIRED && !!dependencyKey && myIgnoredErrors.includes(dependencyKey)) ||
				(type === DependenciesTableType.CONFLICT && myIgnoredErrors.includes(recordUid));

			return (
				<DetailCheckbox
					aria-label={`Ignore validation error for ${recordName || recordUid}`}
					checked={isSelected}
					disabled={recordType !== ModType.DESCRIPTOR && type === DependenciesTableType.REQUIRED}
					onChange={(checked) => {
						const nextConfig = cloneAppConfig(appConfig);
						let nextIgnoredErrors = nextConfig.ignoredValidationErrors.get(errorType as ModErrorType);
						if (!nextIgnoredErrors) {
							nextIgnoredErrors = {};
							nextConfig.ignoredValidationErrors.set(errorType as ModErrorType, nextIgnoredErrors);
						}

						const existingValues = nextIgnoredErrors[currentRecordUid] || [];
						const targetValue = type === DependenciesTableType.REQUIRED ? dependencyKey : recordUid;
						if (!targetValue) {
							return;
						}

						nextIgnoredErrors[currentRecordUid] = checked
							? [...new Set([...existingValues, targetValue])]
							: existingValues.filter((ignoredID) => ignoredID !== targetValue);

						void (async () => {
							try {
								await writeConfig(nextConfig);
								updateAppState({ config: nextConfig });
								validateCollection({ config: nextConfig });
							} catch (error) {
								api.logger.error(error);
								openNotification(
									{
										message: 'Failed to update config',
										placement: 'bottomLeft',
										duration: null
									},
									'error'
								);
							}
						})();
					}}
				/>
			);
		};
	}, [appConfig, currentRecord, openNotification, updateAppState, validateCollection]);

	const getDependenciesSchema = useCallback((tableType: DependenciesTableType) => {
		const STATE_SCHEMA: DetailColumn = {
			title: 'State',
			dataIndex: 'errors',
			render: (errors: ModErrors | undefined, record: DisplayModData) => {
				const collection = activeCollection as ModCollection;
				const selectedMods = collection.mods;

				if (record.type === ModType.DESCRIPTOR) {
					const children = record.children?.map((data) => data.uid) || [];
					const selectedChildren = children.filter((uid) => selectedMods.includes(uid));
					if (selectedChildren.length > 1) {
						return <DetailTag style={APP_TAG_STYLES.danger}>Conflicts</DetailTag>;
					}
				}

				if (!selectedMods.includes(record.uid)) {
					if (!record.subscribed && record.workshopID && record.workshopID > 0) {
						return <DetailTag key="notSubscribed" style={APP_TAG_STYLES.warning}>Not subscribed</DetailTag>;
					}
					if (record.subscribed && !record.installed) {
						return <DetailTag key="notInstalled" style={APP_TAG_STYLES.warning}>Not installed</DetailTag>;
					}
					return null;
				}

				const errorTags: { text: string; tone: keyof typeof APP_TAG_STYLES }[] = [];
				if (errors) {
					if (errors.incompatibleMods?.length) {
						errorTags.push({ text: 'Conflicts', tone: 'danger' });
					}
					if (errors.invalidId) {
						errorTags.push({ text: 'Invalid ID', tone: 'danger' });
					}
					if (errors.missingDependencies?.length) {
						errorTags.push({ text: 'Missing dependencies', tone: 'warning' });
					}
					if (errors.notSubscribed) {
						errorTags.push({ text: 'Not subscribed', tone: 'warning' });
					} else if (errors.notInstalled) {
						errorTags.push({ text: 'Not installed', tone: 'warning' });
					} else if (errors.needsUpdate) {
						errorTags.push({ text: 'Needs update', tone: 'warning' });
					}
				}

				if (errorTags.length > 0) {
					return errorTags.map((tagConfig) => (
						<DetailTag key={tagConfig.text} style={APP_TAG_STYLES[tagConfig.tone]}>
							{tagConfig.text}
						</DetailTag>
					));
				}

				if (lastValidationStatus !== undefined) {
					return (
						<DetailTag key="OK" style={APP_TAG_STYLES.success}>
							OK
						</DetailTag>
					);
				}

				return <DetailTag key="Pending" style={APP_TAG_STYLES.neutral}>Pending</DetailTag>;
			}
		};

		const AUTHOR_SPECIFIED_DEPENDENCY_SCHEMA: DetailColumn = {
			title: (
				<DetailIcon label="Author-specified dependency column">
					<CircleHelp size={15} aria-hidden="true" />
				</DetailIcon>
			),
			dataIndex: 'workshopID',
			render: (workshopID: bigint | undefined) => {
				if (!!workshopID && currentRecord.steamDependencies?.includes(workshopID)) {
					return (
						<DetailIcon label="Author-specified dependency">
							<CheckSquare size={15} aria-hidden="true" />
						</DetailIcon>
					);
				}
				return null;
			},
			width: 30,
			align: 'center'
		};

		const descriptorColumnSchema: DetailColumn[] = [NAME_SCHEMA];
		if (tableType === DependenciesTableType.REQUIRED) {
			descriptorColumnSchema.push(AUTHOR_SPECIFIED_DEPENDENCY_SCHEMA);
		}
		[TYPE_SCHEMA, AUTHORS_SCHEMA, STATE_SCHEMA, ID_SCHEMA].forEach((schema) => descriptorColumnSchema.push(schema));

		const ignoredRenderer = getIgnoredRenderer(tableType);
		if (ignoredRenderer) {
			descriptorColumnSchema.push({
				title: 'Ignored',
				render: ignoredRenderer
			});
		}

		return descriptorColumnSchema;
	}, [activeCollection, currentRecord, getIgnoredRenderer, lastValidationStatus]);

	const getDependenciesRowSelection = useCallback((_type: DependenciesTableType, data: DisplayModData[]) => {
		const { mods } = activeCollection!;
		const availableKeys = new Set(getDependencySelectionKeys(data));

		const rowSelection: DetailRowSelection = {
			selectedRowKeys: mods.filter((uid) => availableKeys.has(uid)),
			checkStrictly: false,
			onChange: (selectedRowKeys: Key[]) => {
				const changes: { [uid: string]: boolean } = {};
				data.forEach((record) => {
					if (record.type === ModType.DESCRIPTOR) {
						if (record.children) {
							record.children.forEach((childData) => {
								changes[childData.uid] = selectedRowKeys.includes(childData.uid);
							});
						} else {
							changes[record.uid] = selectedRowKeys.includes(record.uid);
						}
					} else {
						changes[record.uid] = selectedRowKeys.includes(record.uid);
					}
				});
				setModSubsetCallback(changes);
			},
			onSelect: (record: DisplayModData, selected: boolean) => {
				if (record.type !== ModType.DESCRIPTOR) {
					if (selected) {
						enableModCallback(record.uid);
					} else {
						disableModCallback(record.uid);
					}
				}
			},
			onSelectAll: () => {
				const changes: { [uid: string]: boolean } = {};
				data.forEach((record) => {
					if (record.type === ModType.DESCRIPTOR) {
						if (record.children) {
							record.children.forEach((childData) => {
								changes[childData.uid] = true;
							});
						} else {
							changes[record.uid] = true;
						}
					} else {
						changes[record.uid] = true;
					}
				});
				setModSubsetCallback(changes);
			},
			onSelectNone: () => {
				const changes: { [uid: string]: boolean } = {};
				data.forEach((record) => {
					if (record.type === ModType.DESCRIPTOR) {
						if (record.children) {
							record.children.forEach((childData) => {
								changes[childData.uid] = false;
							});
						} else {
							changes[record.uid] = false;
						}
					} else {
						changes[record.uid] = false;
					}
				});
				setModSubsetCallback(changes);
			}
		};

		return rowSelection;
	}, [activeCollection, disableModCallback, enableModCallback, setModSubsetCallback]);

	const renderInfoTab = () => {
		const descriptionColumns = bigDetails && halfLayoutMode === 'bottom' ? 2 : 1;
		const steamTags = currentRecord.tags?.map((tag) => <DetailTag key={tag}>{tag}</DetailTag>) || [];
		const userTags =
			currentRecord.overrides?.tags?.map((tag) => (
				<DetailTag key={tag} style={APP_TAG_STYLES.accent}>
					{tag}
				</DetailTag>
			)) || [];

		return (
			<DetailDescriptions
				column={descriptionColumns}
				items={[
					{ label: 'Author', children: currentRecord.authors },
					{ label: 'Tags', children: steamTags.concat(userTags) },
					{ label: 'Created', children: formatDateStr(currentRecord.dateCreated) },
					{ label: 'Installed', children: formatDateStr(currentRecord.dateAdded) },
					{
						label: 'Description',
						span: descriptionColumns,
						children: (
							<WorkshopDescription
								description={currentRecord.description}
								imageAltFallback={`${getModDataDisplayName(currentRecord) || currentRecord.uid} workshop description image`}
							/>
						)
					}
				]}
			/>
		);
	};

	const renderInspectTab = () => {
		const { activeCollection, mods } = appState;
		const modDescriptor = getDescriptor(mods, currentRecord);

		return (
			<DetailCollapse
				className="ModDetailInspect"
				defaultActiveKey={['info', 'descriptor', 'properties', 'status']}
				items={[
					{
						key: 'info',
						label: 'Mod Info',
						children: (
							<DetailDescriptions
								items={[
									{
										label: 'ID',
										children: currentRecordID ? (
											currentRecordID
										) : (
											<DetailIconButton
												aria-label={`Edit the override ID for ${currentRecord.name}`}
												onClick={() => {
													openModal(CollectionManagerModalType.EDIT_OVERRIDES);
												}}
											>
												<Edit3 size={15} aria-hidden="true" />
											</DetailIconButton>
										)
									},
									...(currentRecord.workshopID !== undefined && !!currentRecord.id
										? [{ label: 'Mod ID', children: currentRecord.id }]
										: []),
									...(currentRecord?.overrides?.id
										? [
												{
													label: currentRecord.workshopID !== undefined ? 'Mod ID (Override)' : 'ID (Override)',
													children: (
														<>
															<DetailIconButton
																aria-label={`Edit the override ID for ${currentRecord.name}`}
																onClick={() => {
																	openModal(CollectionManagerModalType.EDIT_OVERRIDES);
																}}
															>
																<Edit3 size={15} aria-hidden="true" />
															</DetailIconButton>
															{currentRecord.overrides.id}
														</>
													)
												}
										  ]
										: []),
									{ label: 'UID', children: currentRecord.uid },
									{ label: 'Name', children: currentRecord.name },
									{ label: 'Author', children: currentRecord.authors },
									{ label: 'Tags', children: currentRecord.tags ? currentRecord.tags.join(', ') : null },
									...(currentRecord?.overrides?.tags
										? [{ label: 'User Tags', children: currentRecord.overrides.tags.join(', ') }]
										: []),
									{ label: 'Description', children: currentRecord.description }
								]}
							/>
						)
					},
					{
						key: 'descriptor',
						label: 'Mod Descriptor',
						children: (
							<DetailDescriptions
								items={[
									{ label: 'Name', children: modDescriptor?.name },
									{ label: 'Mod ID', children: modDescriptor?.modID },
									{ label: 'Equivalent UIDs', children: [...(modDescriptor?.UIDs || [])].join(', ') }
								]}
							/>
						)
					},
					{
						key: 'properties',
						label: 'Mod Properties',
						children: (
							<DetailDescriptions
								items={[
									{
										label: 'BrowserLink',
										children: currentRecord.workshopID
											? `https://steamcommunity.com/sharedfiles/filedetails/?id=${currentRecord.workshopID}`
											: null
									},
									{ label: 'Requires RR', children: 'UNKNOWN' },
									{ label: 'Has Code', children: (!!currentRecord.hasCode).toString() },
									{ label: 'Date Added', children: formatDateStr(currentRecord.dateAdded) },
									{ label: 'Date Created', children: formatDateStr(currentRecord.dateCreated) },
									{ label: 'Date Updated', children: formatDateStr(currentRecord.lastUpdate) },
									{ label: 'Image', children: currentRecord.preview },
									{ label: 'Path', children: currentRecord.path },
									{ label: 'Size', children: currentRecord.size },
									{ label: 'Source', children: currentRecord.type },
									{
										label: 'SteamLink',
										children: currentRecord.workshopID ? `steam://url/CommunityFilePage/${currentRecord.workshopID}` : null
									},
									{ label: 'Workshop ID', children: currentRecord.workshopID ? currentRecord.workshopID.toString() : null }
								]}
							/>
						)
					},
					{
						key: 'status',
						label: 'Mod Status',
						children: (
							<DetailDescriptions
								items={[
									{ label: 'Subscribed', children: (!!currentRecord.subscribed).toString() },
									{ label: 'Downloading', children: (!!currentRecord.downloading).toString() },
									{ label: 'Download Pending', children: (!!currentRecord.downloadPending).toString() },
									{ label: 'Needs Update', children: (!!currentRecord.needsUpdate).toString() },
									{ label: 'Is Installed', children: (!!currentRecord.installed).toString() },
									{ label: 'Is Active', children: (!!activeCollection && activeCollection.mods.includes(currentRecord.uid)).toString() }
								]}
							/>
						)
					}
				]}
			/>
		);
	};

	const renderDependenciesTab = (requiredModData: DisplayModData[], dependentModData: DisplayModData[], conflictingModData: DisplayModData[]) => {
		return (
			<div className="ModDetailDependenciesPane">
				{dependencyLookupError ? (
					<div className="ModDetailDependencyError">
						<div className="StatusCallout StatusCallout--warning">
							<strong className="StatusCallout__title">
								Workshop dependency refresh failed
							</strong>
							<span className="StatusCallout__body">{dependencyLookupError}</span>
						</div>
						<DetailButton
							onClick={() => {
								setDependencyLookupError(undefined);
							}}
						>
							Retry Workshop Dependency Lookup
						</DetailButton>
					</div>
				) : null}
				<DetailCollapse
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
	};

	const compactStyle = {
		height: '100%',
		minHeight: 0,
		display: 'flex',
		flexDirection: 'column' as const
	};
	const expandedStyle = {
		display: 'flex',
		flexDirection: 'column' as const,
		minHeight: 0
	};
	const { mods } = appState;
	const modDescriptor = getDescriptor(mods, currentRecord);
	const dependentModDescriptors = currentRecord.isDependencyFor ?? EMPTY_MOD_DESCRIPTORS;
	const requiredModDescriptors = currentRecord.dependsOn ?? EMPTY_MOD_DESCRIPTORS;

	const mapDescriptorToDisplayMod = useCallback(
		(descriptor: (typeof requiredModDescriptors)[number], groupedNameSuffix?: string): DisplayModData => {
			const descriptorKey = getModDescriptorKey(descriptor) || 'unknown';
			const descriptorName = getModDescriptorDisplayName(descriptor);
			const descriptorRecord: DisplayModData = {
				uid: `${ModType.DESCRIPTOR}:${descriptorKey}`,
				id: descriptor.modID || null,
				workshopID: descriptor.workshopID,
				type: ModType.DESCRIPTOR,
				name: groupedNameSuffix ? `${descriptorName} ${groupedNameSuffix}` : descriptorName
			};
			const uids = descriptor.UIDs;

			if (uids.size === 0) {
				return descriptorRecord;
			}

			if (uids.size === 1) {
				const [uid] = [...uids];
				const modData = mods.modIdToModDataMap.get(uid);
				if (modData) {
					return { ...modData, type: ModType.DESCRIPTOR };
				}
				return descriptorRecord;
			}

			return {
				...descriptorRecord,
				children: [...uids].map((uid) => mods.modIdToModDataMap.get(uid) || { uid, id: 'INVALID', type: ModType.INVALID })
			};
		},
		[mods.modIdToModDataMap]
	);

	const requiredModData: DisplayModData[] = useMemo(() => {
		return requiredModDescriptors.map((descriptor) => {
			return mapDescriptorToDisplayMod(descriptor);
		});
	}, [mapDescriptorToDisplayMod, requiredModDescriptors]);

	const dependentModData: DisplayModData[] = useMemo(() => {
		return dependentModDescriptors.map((descriptor) => {
			return mapDescriptorToDisplayMod(descriptor, 'Mod Group');
		});
	}, [dependentModDescriptors, mapDescriptorToDisplayMod]);

	const conflictingModData: DisplayModData[] = useMemo(() => {
		return [...(modDescriptor?.UIDs || [])]
			.filter((uid) => uid !== currentRecord.uid)
			.map((uid) => mods.modIdToModDataMap.get(uid) || { uid, id: 'INVALID', type: ModType.INVALID });
	}, [currentRecord.uid, modDescriptor?.UIDs, mods.modIdToModDataMap]);
	const requiredDependencyColumns = useMemo(
		() => getDependenciesSchema(DependenciesTableType.REQUIRED),
		[getDependenciesSchema]
	);
	const dependentDependencyColumns = useMemo(
		() => getDependenciesSchema(DependenciesTableType.DEPENDENT),
		[getDependenciesSchema]
	);
	const conflictingDependencyColumns = useMemo(
		() => getDependenciesSchema(DependenciesTableType.CONFLICT),
		[getDependenciesSchema]
	);
	const requiredDependencyRowSelection = useMemo(
		() => getDependenciesRowSelection(DependenciesTableType.REQUIRED, requiredModData),
		[getDependenciesRowSelection, requiredModData]
	);
	const dependentDependencyRowSelection = useMemo(
		() => getDependenciesRowSelection(DependenciesTableType.DEPENDENT, dependentModData),
		[getDependenciesRowSelection, dependentModData]
	);
	const conflictingDependencyRowSelection = useMemo(
		() => getDependenciesRowSelection(DependenciesTableType.CONFLICT, conflictingModData),
		[getDependenciesRowSelection, conflictingModData]
	);

	const currentRecordID = getModDataDisplayId(currentRecord);
	const tabItems = [
		{
			key: 'info',
			label: 'Info',
			children: activeTabKey === 'info' ? renderInfoTab() : null
		},
		{
			key: 'inspect',
			label: 'Inspect',
			children: activeTabKey === 'inspect' ? renderInspectTab() : null
		},
		{
			key: 'dependencies',
			label: 'Dependencies',
			children: activeTabKey === 'dependencies' ? renderDependenciesTab(requiredModData, dependentModData, conflictingModData) : null
		}
	];

	return (
		<section className="ModDetailFooter" style={bigDetails ? expandedStyle : compactStyle}>
			<div
				className="ModDetailFooterHeader"
				style={{
					width: '100%',
					minHeight: 48,
					padding: '8px 16px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 16
				}}
			>
				<div>
					<h2 className="ModDetailFooterTitle">
						{currentRecord.name}
					</h2>
					<div className="ModDetailFooterIdentity">{currentRecordID ? `${currentRecordID} (${currentRecord.uid})` : currentRecord.uid}</div>
				</div>
				<div className="ModDetailFooterHeaderActions">
					<DetailIconButton
						aria-label={halfLayoutMode === 'side' ? 'Switch to bottom split layout' : 'Switch to side-by-side split layout'}
						aria-pressed={halfLayoutMode === 'side'}
						title={halfLayoutMode === 'side' ? 'Use bottom split for half view' : 'Use side-by-side split for half view'}
						onClick={toggleHalfLayoutCallback}
					>
						{halfLayoutMode === 'side' ? <PanelBottom size={18} aria-hidden="true" /> : <PanelRight size={18} aria-hidden="true" />}
					</DetailIconButton>
					<DetailIconButton
						aria-label={bigDetails ? 'Return details to split view' : 'Expand details to full view'}
						aria-pressed={bigDetails}
						title={bigDetails ? 'Return to split details' : 'Expand details to full view'}
						onClick={() => {
							expandFooterCallback(!bigDetails);
						}}
					>
						{bigDetails ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
					</DetailIconButton>
					<DetailIconButton aria-label="Close details" title="Close details" onClick={closeFooterCallback}>
						<X size={18} aria-hidden="true" />
					</DetailIconButton>
				</div>
			</div>
			<div key="mod-details" className="ModDetailFooterBody">
				<div className="ModDetailFooterPreviewCol">
					{getImagePreview(currentRecord.preview, `${currentRecord.name} preview image`)}
				</div>
				<div className="ModDetailFooterContentCol">
					<DetailTabs activeKey={activeTabKey} onChange={setActiveTabKey} items={tabItems} />
				</div>
			</div>
		</section>
	);
}

export default memo(ModDetailsFooter);
