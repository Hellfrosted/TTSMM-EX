import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type Key, type ReactNode } from 'react';
import { CheckSquare, CircleHelp, Clock3, Edit3, FolderOpen, LoaderCircle, TriangleAlert } from 'lucide-react';
import api from 'renderer/Api';
import {
	createModDependencyProjection,
	DisplayModData,
	getDescriptor,
	getModDataDisplayName,
	ModErrors,
	ModErrorType,
	ModType,
	NotificationProps,
	getModDataDisplayId,
	getModDataDependencyIgnoreKey,
	compareModDataDisplayName,
	compareModDataDisplayId,
	CollectionManagerModalType,
	getCollectionStatusTags
} from 'model';
import {
	getWorkshopDependencySnapshotState,
	shouldRefreshWorkshopDependencySnapshot,
	type WorkshopDependencySnapshotState
} from 'shared/workshop-dependency-snapshot';
import { formatDateStr } from 'util/Date';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { persistConfigChange } from 'renderer/util/config-write';
import { WorkshopDescription } from 'renderer/util/workshop-description';
import { APP_TAG_STYLES } from 'renderer/theme';
import { DetailCheckbox, ModDetailsDependenciesPane, type DetailColumn, type DetailRowSelection } from './mod-details-dependencies';
import { DetailIconButton, ModDetailsFooterHeader, ModDetailsPreview } from './mod-details-presentation';
import { ModTypeIcon } from './mod-type-presentation';

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

function DetailDescriptions({ column = 1, items }: { column?: number; items: DetailDescriptionItem[] }) {
	return (
		<div className={`ModDetailDescriptions ModDetailDescriptions--columns-${column}`}>
			{items.map((item) => (
				<div
					key={String(item.label)}
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

function DetailCollapse({
	className = '',
	defaultActiveKey,
	items
}: {
	className?: string;
	defaultActiveKey?: string[];
	items: DetailCollapseItem[];
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

enum DependenciesTableType {
	REQUIRED = 0,
	DEPENDENT = 1,
	CONFLICT = 2
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

interface DependencyLookupState {
	loadingDependencies: boolean;
	dependencyLookupError?: string;
	dependencyLookupNotice?: string;
	manualLookupRequest: number;
}

type DependencyLookupAction =
	| { type: 'record-changed' }
	| { type: 'tab-left' }
	| { type: 'lookup-cancelled' }
	| { type: 'lookup-started' }
	| { type: 'lookup-succeeded' }
	| { type: 'lookup-unknown'; message?: string }
	| { type: 'lookup-failed'; message: string }
	| { type: 'retry-requested' };

function dependencyLookupReducer(state: DependencyLookupState, action: DependencyLookupAction): DependencyLookupState {
	switch (action.type) {
		case 'lookup-started':
			return { ...state, loadingDependencies: true };
		case 'lookup-succeeded':
			return { ...state, loadingDependencies: false, dependencyLookupError: undefined, dependencyLookupNotice: undefined };
		case 'lookup-unknown':
			return { ...state, loadingDependencies: false, dependencyLookupError: undefined, dependencyLookupNotice: action.message };
		case 'lookup-failed':
			return { ...state, loadingDependencies: false, dependencyLookupError: action.message, dependencyLookupNotice: undefined };
		case 'lookup-cancelled':
			return { ...state, loadingDependencies: false };
		case 'record-changed':
		case 'tab-left':
			return { ...state, dependencyLookupError: undefined, dependencyLookupNotice: undefined };
		case 'retry-requested':
			return {
				...state,
				dependencyLookupError: undefined,
				dependencyLookupNotice: undefined,
				manualLookupRequest: state.manualLookupRequest + 1
			};
		default:
			return state;
	}
}

function getUnknownWorkshopDependencyLookupMessage() {
	return 'Steamworks did not provide Workshop dependency metadata for this mod.';
}

function getWorkshopDependencyEmptyText(recordType: ModType, snapshotState: WorkshopDependencySnapshotState) {
	if (recordType !== ModType.WORKSHOP) {
		return undefined;
	}

	switch (snapshotState.kind) {
		case 'known-empty':
			return 'Steamworks reports no Workshop dependencies for this mod.';
		case 'stale-known-empty':
			return 'Steamworks last reported no Workshop dependencies for this mod.';
		case 'unknown':
		case 'stale-unknown':
			return 'Workshop dependency metadata is unknown for this mod.';
		case 'never-checked':
			return 'Workshop dependency metadata has not been checked for this mod.';
		case 'known':
		case 'stale-known':
			return 'No Workshop dependencies are known for this mod.';
	}
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
	render: (type: ModType) => <ModTypeIcon type={type} size={20} className="ModDetailIcon" />,
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

function useModDetailsFooterContent({
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
	const handledManualDependencyLookupRequestRef = useRef(0);
	const dependencyLookupErrorUidRef = useRef(currentRecord.uid);
	const [{ dependencyLookupError, dependencyLookupNotice, loadingDependencies, manualLookupRequest }, dispatchDependencyLookup] =
		useReducer(dependencyLookupReducer, {
			loadingDependencies: false,
			manualLookupRequest: 0
		});
	const { activeCollection, config: appConfig, updateState: updateAppState } = appState;
	const currentRecordUid = currentRecord.uid;
	const currentRecordType = currentRecord.type;
	const currentRecordWorkshopID = currentRecord.workshopID;
	const currentRecordSteamDependencies = currentRecord.steamDependencies;
	const currentRecordSteamDependenciesFetchedAt = currentRecord.steamDependenciesFetchedAt;
	const currentRecordWorkshopDependencySnapshotState = useMemo(
		() =>
			getWorkshopDependencySnapshotState({
				steamDependencies: currentRecordSteamDependencies,
				steamDependenciesFetchedAt: currentRecordSteamDependenciesFetchedAt
			}),
		[currentRecordSteamDependencies, currentRecordSteamDependenciesFetchedAt]
	);

	useEffect(() => {
		if (dependencyLookupErrorUidRef.current !== currentRecordUid) {
			dependencyLookupErrorUidRef.current = currentRecordUid;
			dispatchDependencyLookup({ type: 'record-changed' });
		}

		if (requestedDependencyLookupUidRef.current === null) {
			return;
		}

		if (activeTabKey === 'dependencies' && requestedDependencyLookupUidRef.current === currentRecordUid) {
			return;
		}

		requestedDependencyLookupUidRef.current = null;
		dispatchDependencyLookup({ type: 'lookup-cancelled' });
	}, [activeTabKey, currentRecordUid]);

	useEffect(() => {
		if (activeTabKey !== 'dependencies') {
			dispatchDependencyLookup({ type: 'tab-left' });
		}
	}, [activeTabKey]);

	useEffect(() => {
		const currentWorkshopDependencySnapshotState = getWorkshopDependencySnapshotState({
			steamDependencies: currentRecordSteamDependencies,
			steamDependenciesFetchedAt: currentRecordSteamDependenciesFetchedAt
		});
		const shouldRefreshWorkshopDependencies = shouldRefreshWorkshopDependencySnapshot(currentWorkshopDependencySnapshotState);
		const shouldRunManualLookup = manualLookupRequest !== handledManualDependencyLookupRequestRef.current;

		if (
			activeTabKey !== 'dependencies' ||
			currentRecordType !== ModType.WORKSHOP ||
			currentRecordWorkshopID === undefined ||
			(!shouldRefreshWorkshopDependencies && !shouldRunManualLookup) ||
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

			const message =
				'Could not refresh the Workshop dependency list for this mod. Retry to use the latest author-defined dependency data.';
			requestedDependencyLookupUidRef.current = currentRecordUid;
			handledManualDependencyLookupRequestRef.current = manualLookupRequest;
			dispatchDependencyLookup({ type: 'lookup-started' });
			try {
				const result = await api.fetchWorkshopDependencies(currentRecordWorkshopID);
				if (result.status === 'failed') {
					api.logger.warn(message);
					if (!cancelled) {
						dispatchDependencyLookup({ type: 'lookup-failed', message });
					}
					return;
				}
				if (result.status === 'unknown') {
					if (!cancelled) {
						dispatchDependencyLookup({
							type: 'lookup-unknown',
							message: getUnknownWorkshopDependencyLookupMessage()
						});
					}
					return;
				}
				if (!cancelled) {
					dispatchDependencyLookup({ type: 'lookup-succeeded' });
				}
			} catch (error) {
				api.logger.error(message);
				api.logger.error(error);
				if (!cancelled) {
					dispatchDependencyLookup({ type: 'lookup-failed', message });
				}
			} finally {
				if (!cancelled) {
					requestedDependencyLookupUidRef.current = null;
					dispatchDependencyLookup({ type: 'lookup-cancelled' });
				}
			}
		};

		void loadDependencies();

		return () => {
			cancelled = true;
			if (requestedDependencyLookupUidRef.current === currentRecordUid) {
				requestedDependencyLookupUidRef.current = null;
				dispatchDependencyLookup({ type: 'lookup-cancelled' });
			}
		};
	}, [
		activeTabKey,
		currentRecordSteamDependencies,
		currentRecordSteamDependenciesFetchedAt,
		currentRecordUid,
		currentRecordType,
		currentRecordWorkshopID,
		dependencyLookupError,
		manualLookupRequest
	]);

	const getIgnoredRenderer = useCallback(
		(type: DependenciesTableType) => {
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
				const dependencyKey = getModDataDependencyIgnoreKey(record);
				const { name: recordName, type: recordType, uid: recordUid } = record;
				const recordDisplayName = recordName || getModDataDisplayName(record) || recordUid;
				const isSelected =
					(type === DependenciesTableType.REQUIRED && !!dependencyKey && myIgnoredErrors.includes(dependencyKey)) ||
					(type === DependenciesTableType.CONFLICT && myIgnoredErrors.includes(recordUid));

				return (
					<DetailCheckbox
						aria-label={`Ignore validation error for ${recordDisplayName}`}
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
									await persistConfigChange(nextConfig, (persistedConfig) => {
										updateAppState({ config: persistedConfig });
										validateCollection({ config: persistedConfig });
									});
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
		},
		[appConfig, currentRecord, openNotification, updateAppState, validateCollection]
	);

	const getDependenciesSchema = useCallback(
		(tableType: DependenciesTableType) => {
			const STATE_SCHEMA: DetailColumn = {
				title: 'State',
				dataIndex: 'errors',
				render: (errors: ModErrors | undefined, record: DisplayModData) => {
					const statusTags = getCollectionStatusTags({
						lastValidationStatus,
						record: {
							...record,
							errors
						},
						selectedMods: activeCollection?.mods ?? []
					});

					if (statusTags.length > 0) {
						return statusTags.map((tagConfig) => (
							<DetailTag key={tagConfig.text} style={APP_TAG_STYLES[tagConfig.tone]}>
								{tagConfig.text}
							</DetailTag>
						));
					}
					return null;
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
		},
		[activeCollection, currentRecord, getIgnoredRenderer, lastValidationStatus]
	);

	const getDependenciesRowSelection = useCallback(
		(_type: DependenciesTableType, data: DisplayModData[]) => {
			const selectedMods = activeCollection?.mods ?? [];
			const availableKeys = new Set(getDependencySelectionKeys(data));

			const rowSelection: DetailRowSelection = {
				selectedRowKeys: selectedMods.filter((uid) => availableKeys.has(uid)),
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
		},
		[activeCollection, disableModCallback, enableModCallback, setModSubsetCallback]
	);

	const currentRecordDisplayName = currentRecord.name || getModDataDisplayName(currentRecord) || currentRecord.uid;
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
					...(!bigDetails
						? [
								{
									label: 'Preview',
									children: (
										<div className="ModDetailInlinePreview">
											<ModDetailsPreview path={currentRecord.preview} altText={`${currentRecordDisplayName} preview image`} />
										</div>
									)
								}
							]
						: []),
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
									...(currentRecord?.overrides?.tags ? [{ label: 'User Tags', children: currentRecord.overrides.tags.join(', ') }] : []),
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

	const renderDependenciesTab = (
		requiredModData: DisplayModData[],
		dependentModData: DisplayModData[],
		conflictingModData: DisplayModData[]
	) => {
		return (
			<ModDetailsDependenciesPane
				conflictingDependencyColumns={conflictingDependencyColumns}
				conflictingDependencyRowSelection={conflictingDependencyRowSelection}
				conflictingModData={conflictingModData}
				dependencyLookupError={dependencyLookupError}
				dependencyLookupNotice={dependencyLookupNotice}
				dependentDependencyColumns={dependentDependencyColumns}
				dependentDependencyRowSelection={dependentDependencyRowSelection}
				dependentModData={dependentModData}
				loadingDependencies={loadingDependencies}
				onRetryDependencyLookup={() => {
					dispatchDependencyLookup({ type: 'retry-requested' });
				}}
				requiredDependencyColumns={requiredDependencyColumns}
				requiredEmptyText={getWorkshopDependencyEmptyText(currentRecordType, currentRecordWorkshopDependencySnapshotState)}
				requiredDependencyRowSelection={requiredDependencyRowSelection}
				requiredModData={requiredModData}
			/>
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
	const { conflictingModData, dependentModData, requiredModData } = useMemo(() => {
		return createModDependencyProjection(mods, currentRecord);
	}, [currentRecord, mods]);
	const requiredDependencyColumns = useMemo(() => getDependenciesSchema(DependenciesTableType.REQUIRED), [getDependenciesSchema]);
	const dependentDependencyColumns = useMemo(() => getDependenciesSchema(DependenciesTableType.DEPENDENT), [getDependenciesSchema]);
	const conflictingDependencyColumns = useMemo(() => getDependenciesSchema(DependenciesTableType.CONFLICT), [getDependenciesSchema]);
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
			<ModDetailsFooterHeader
				bigDetails={bigDetails}
				halfLayoutMode={halfLayoutMode}
				identity={currentRecordID ? `${currentRecordID} (${currentRecord.uid})` : currentRecord.uid}
				name={currentRecordDisplayName}
				onClose={closeFooterCallback}
				onExpandChange={expandFooterCallback}
				onToggleHalfLayout={toggleHalfLayoutCallback}
			/>
			<div key="mod-details" className={`ModDetailFooterBody${bigDetails ? '' : ' ModDetailFooterBody--contentOnly'}`}>
				{bigDetails ? (
					<div className="ModDetailFooterPreviewCol">
						<ModDetailsPreview path={currentRecord.preview} altText={`${currentRecordDisplayName} preview image`} />
					</div>
				) : null}
				<div className="ModDetailFooterContentCol">
					<DetailTabs activeKey={activeTabKey} onChange={setActiveTabKey} items={tabItems} />
				</div>
			</div>
		</section>
	);
}

function ModDetailsFooter(props: ModDetailsFooterProps) {
	return useModDetailsFooterContent(props);
}

export default memo(ModDetailsFooter);
