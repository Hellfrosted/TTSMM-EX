import { memo, useCallback, useEffect, useMemo, useRef, useState, type Key } from 'react';
import {
	Empty,
	Layout,
	Button,
	Typography,
	Col,
	Row,
	Tabs,
	Image,
	Space,
	Card,
	Descriptions,
	Tag,
	Collapse,
	Table,
	Checkbox,
	Tooltip,
	ConfigProvider
} from 'antd';
import CheckSquareFilled from '@ant-design/icons/es/icons/CheckSquareFilled';
import ClockCircleTwoTone from '@ant-design/icons/es/icons/ClockCircleTwoTone';
import ColumnHeightOutlined from '@ant-design/icons/es/icons/ColumnHeightOutlined';
import ColumnWidthOutlined from '@ant-design/icons/es/icons/ColumnWidthOutlined';
import CloseOutlined from '@ant-design/icons/es/icons/CloseOutlined';
import EditFilled from '@ant-design/icons/es/icons/EditFilled';
import FolderOpenFilled from '@ant-design/icons/es/icons/FolderOpenFilled';
import FullscreenExitOutlined from '@ant-design/icons/es/icons/FullscreenExitOutlined';
import FullscreenOutlined from '@ant-design/icons/es/icons/FullscreenOutlined';
import HddFilled from '@ant-design/icons/es/icons/HddFilled';
import QuestionCircleFilled from '@ant-design/icons/es/icons/QuestionCircleFilled';
import StopTwoTone from '@ant-design/icons/es/icons/StopTwoTone';
import WarningTwoTone from '@ant-design/icons/es/icons/WarningTwoTone';
import { ColumnType } from 'antd/lib/table';
import { TableRowSelection } from 'antd/lib/table/interface';
import api from 'renderer/Api';
import {
	AppState,
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
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { writeConfig } from 'renderer/util/config-write';
import { WorkshopDescription } from 'renderer/util/workshop-description';
import { APP_TAG_STYLES, APP_THEME_COLORS } from 'renderer/theme';

import missing from '../../../../assets/missing.png';
import steam from '../../../../assets/steam.png';
import ttmm from '../../../../assets/ttmm.png';

const { Content } = Layout;
const { Text, Title } = Typography;
const DESCRIPTION_LABEL_STYLES = { label: { width: 150 } };
const EMPTY_MOD_DESCRIPTORS: NonNullable<DisplayModData['dependsOn']> = [];

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
				<Tooltip title={label}>
					<span role="img" aria-label={label}>
						<HddFilled width={size} />
					</span>
				</Tooltip>
			);
		case ModType.TTQMM:
			return (
				<Tooltip title={label}>
					<img src={ttmm} width={size} alt={label} key="type" />
				</Tooltip>
			);
		case ModType.WORKSHOP:
			return (
				<Tooltip title={label}>
					<img src={steam} width={size} alt={label} key="type" />
				</Tooltip>
			);
		default:
			return null;
	}
}

function getImagePreview(path?: string, altText = 'Mod preview image') {
	return (
		<Card className="ModDetailFooterPreview" style={{ width: '100%', padding: 10 }}>
			<Image src={path} fallback={missing} alt={altText} width="100%" />
		</Card>
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
	appState: AppState;
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
	validateCollection: (options?: { config?: AppState['config'] }) => void;
	openModal: (modalType: CollectionManagerModalType) => void;
}

const NAME_SCHEMA: ColumnType<DisplayModData> = {
	title: 'Name',
	dataIndex: 'name',
	defaultSortOrder: 'ascend',
	sorter: compareModDataDisplayName,
	render: (_name: string, record: DisplayModData) => {
		const displayName = getModDataDisplayName(record) || record.uid;
		if (record.type === ModType.DESCRIPTOR && record.children && record.children.length > 0) {
			return (
				<span>
					<FolderOpenFilled /> {displayName}
				</span>
			);
		}
		let updateIcon = null;
		let updateType: 'danger' | 'warning' | undefined;
		if (record.needsUpdate) {
			updateIcon = (
				<Tooltip title="Needs update">
					<WarningTwoTone twoToneColor={APP_THEME_COLORS.error} />
				</Tooltip>
			);
			updateType = 'danger';
			if (record.downloadPending) {
				updateIcon = (
					<Tooltip title="Download pending">
						<ClockCircleTwoTone twoToneColor={APP_THEME_COLORS.warning} />
					</Tooltip>
				);
				updateType = 'warning';
			}
			if (record.downloading) {
				updateIcon = (
					<Tooltip title="Downloading">
						<StopTwoTone spin twoToneColor={APP_THEME_COLORS.warning} />
					</Tooltip>
				);
				updateType = 'warning';
			}
		}
		return (
			<span>
				{updateIcon}
				<Text strong={record.needsUpdate} type={updateType}>{` ${displayName}`}</Text>
			</span>
		);
	}
};

const TYPE_SCHEMA: ColumnType<DisplayModData> = {
	title: 'Type',
	dataIndex: 'type',
	render: (type: ModType) => getImageSrcFromType(type, 20),
	width: 65,
	align: 'center'
};

const AUTHORS_SCHEMA: ColumnType<DisplayModData> = {
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
		return (authors || []).map((author) => <Tag key={author}>{author}</Tag>);
	}
};

const ID_SCHEMA: ColumnType<DisplayModData> = {
	title: 'ID',
	dataIndex: 'id',
	sorter: compareModDataDisplayId,
	render: (_: string | null, record: DisplayModData) => {
		const displayID = getModDataDisplayId(record);
		if (!displayID) {
			return null;
		}
		if (record.workshopID === undefined && record.overrides?.id) {
			return <Tag style={APP_TAG_STYLES.neutral}>{displayID}</Tag>;
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
				<Checkbox
					aria-label={`Ignore validation error for ${recordName || recordUid}`}
					checked={isSelected}
					disabled={recordType !== ModType.DESCRIPTOR && type === DependenciesTableType.REQUIRED}
					onChange={(event) => {
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

						nextIgnoredErrors[currentRecordUid] = event.target.checked
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
		const STATE_SCHEMA: ColumnType<DisplayModData> = {
			title: 'State',
			dataIndex: 'errors',
			render: (errors: ModErrors | undefined, record: DisplayModData) => {
				const collection = activeCollection as ModCollection;
				const selectedMods = collection.mods;

				if (record.type === ModType.DESCRIPTOR) {
					const children = record.children?.map((data) => data.uid) || [];
					const selectedChildren = children.filter((uid) => selectedMods.includes(uid));
					if (selectedChildren.length > 1) {
						return <Tag style={APP_TAG_STYLES.danger}>Conflicts</Tag>;
					}
				}

				if (!selectedMods.includes(record.uid)) {
					if (!record.subscribed && record.workshopID && record.workshopID > 0) {
						return <Tag key="notSubscribed" style={APP_TAG_STYLES.warning}>Not subscribed</Tag>;
					}
					if (record.subscribed && !record.installed) {
						return <Tag key="notInstalled" style={APP_TAG_STYLES.warning}>Not installed</Tag>;
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
						<Tag key={tagConfig.text} style={APP_TAG_STYLES[tagConfig.tone]}>
							{tagConfig.text}
						</Tag>
					));
				}

				if (lastValidationStatus !== undefined) {
					return (
						<Tag key="OK" style={APP_TAG_STYLES.success}>
							OK
						</Tag>
					);
				}

				return <Tag key="Pending" style={APP_TAG_STYLES.neutral}>Pending</Tag>;
			}
		};

		const AUTHOR_SPECIFIED_DEPENDENCY_SCHEMA: ColumnType<DisplayModData> = {
			title: (
				<Tooltip title="Which version of the mod did the author say is the canonical dependency?">
					<span role="img" aria-label="Author-specified dependency column">
						<QuestionCircleFilled />
					</span>
				</Tooltip>
			),
			dataIndex: 'workshopID',
			render: (workshopID: bigint | undefined) => {
				if (!!workshopID && currentRecord.steamDependencies?.includes(workshopID)) {
					return (
						<Tooltip title="This is the mod the author specified as the canonical dependency">
							<span role="img" aria-label="Author-specified dependency">
								<CheckSquareFilled />
							</span>
						</Tooltip>
					);
				}
				return null;
			},
			width: 30,
			align: 'center'
		};

		const descriptorColumnSchema: ColumnType<DisplayModData>[] = [NAME_SCHEMA];
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

		const rowSelection: TableRowSelection<DisplayModData> = {
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
		const steamTags = currentRecord.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>) || [];
		const userTags =
			currentRecord.overrides?.tags?.map((tag) => (
				<Tag key={tag} style={APP_TAG_STYLES.accent}>
					{tag}
				</Tag>
			)) || [];

		return (
			<Descriptions column={descriptionColumns} bordered size="small">
				<Descriptions.Item label="Author">{currentRecord.authors}</Descriptions.Item>
				<Descriptions.Item label="Tags">{steamTags.concat(userTags)}</Descriptions.Item>
				<Descriptions.Item label="Created">{formatDateStr(currentRecord.dateCreated)}</Descriptions.Item>
				<Descriptions.Item label="Installed">{formatDateStr(currentRecord.dateAdded)}</Descriptions.Item>
				<Descriptions.Item label="Description" span={descriptionColumns}>
					<WorkshopDescription
						description={currentRecord.description}
						imageAltFallback={`${getModDataDisplayName(currentRecord) || currentRecord.uid} workshop description image`}
					/>
				</Descriptions.Item>
			</Descriptions>
		);
	};

	const renderInspectTab = () => {
		const { activeCollection, mods } = appState;
		const modDescriptor = getDescriptor(mods, currentRecord);

		return (
			<Collapse
				className="ModDetailInspect"
				defaultActiveKey={['info', 'descriptor', 'properties', 'status']}
				items={[
					{
						key: 'info',
						label: 'Mod Info',
						children: (
					<Descriptions column={1} bordered size="small" styles={DESCRIPTION_LABEL_STYLES}>
						<Descriptions.Item label="ID">
							{currentRecordID ? (
								currentRecordID
							) : (
								<Button
									aria-label={`Edit the override ID for ${currentRecord.name}`}
									icon={<EditFilled />}
									onClick={() => {
										openModal(CollectionManagerModalType.EDIT_OVERRIDES);
									}}
								/>
							)}
						</Descriptions.Item>
						{currentRecord.workshopID !== undefined && !!currentRecord.id ? (
							<Descriptions.Item label="Mod ID">{currentRecord.id}</Descriptions.Item>
						) : null}
						{currentRecord?.overrides?.id ? (
							<Descriptions.Item label={currentRecord.workshopID !== undefined ? 'Mod ID (Override)' : 'ID (Override)'}>
								<Button
									aria-label={`Edit the override ID for ${currentRecord.name}`}
									icon={<EditFilled />}
									onClick={() => {
										openModal(CollectionManagerModalType.EDIT_OVERRIDES);
									}}
								/>
								{currentRecord.overrides.id}
							</Descriptions.Item>
						) : null}
						<Descriptions.Item label="UID">{currentRecord.uid}</Descriptions.Item>
						<Descriptions.Item label="Name">{currentRecord.name}</Descriptions.Item>
						<Descriptions.Item label="Author">{currentRecord.authors}</Descriptions.Item>
						<Descriptions.Item label="Tags">{currentRecord.tags ? currentRecord.tags.join(', ') : null}</Descriptions.Item>
						{currentRecord?.overrides?.tags ? (
							<Descriptions.Item label="User Tags">{currentRecord.overrides.tags.join(', ')}</Descriptions.Item>
						) : null}
						<Descriptions.Item label="Description">{currentRecord.description}</Descriptions.Item>
					</Descriptions>
						)
					},
					{
						key: 'descriptor',
						label: 'Mod Descriptor',
						children: (
					<Descriptions column={1} bordered size="small" styles={DESCRIPTION_LABEL_STYLES}>
						<Descriptions.Item label="Name">{modDescriptor?.name}</Descriptions.Item>
						<Descriptions.Item label="Mod ID">{modDescriptor?.modID}</Descriptions.Item>
						<Descriptions.Item label="Equivalent UIDs">{[...(modDescriptor?.UIDs || [])].join(', ')}</Descriptions.Item>
					</Descriptions>
						)
					},
					{
						key: 'properties',
						label: 'Mod Properties',
						children: (
					<Descriptions column={1} bordered size="small" styles={DESCRIPTION_LABEL_STYLES}>
						<Descriptions.Item label="BrowserLink">
							{currentRecord.workshopID ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${currentRecord.workshopID}` : null}
						</Descriptions.Item>
						<Descriptions.Item label="Requires RR">UNKNOWN</Descriptions.Item>
						<Descriptions.Item label="Has Code">{(!!currentRecord.hasCode).toString()}</Descriptions.Item>
						<Descriptions.Item label="Date Added">{formatDateStr(currentRecord.dateAdded)}</Descriptions.Item>
						<Descriptions.Item label="Date Created">{formatDateStr(currentRecord.dateCreated)}</Descriptions.Item>
						<Descriptions.Item label="Date Updated">{formatDateStr(currentRecord.lastUpdate)}</Descriptions.Item>
						<Descriptions.Item label="Image">{currentRecord.preview}</Descriptions.Item>
						<Descriptions.Item label="Path">{currentRecord.path}</Descriptions.Item>
						<Descriptions.Item label="Size">{currentRecord.size}</Descriptions.Item>
						<Descriptions.Item label="Source">{currentRecord.type}</Descriptions.Item>
						<Descriptions.Item label="SteamLink">
							{currentRecord.workshopID ? `steam://url/CommunityFilePage/${currentRecord.workshopID}` : null}
						</Descriptions.Item>
						<Descriptions.Item label="Workshop ID">
							{currentRecord.workshopID ? currentRecord.workshopID.toString() : null}
						</Descriptions.Item>
					</Descriptions>
						)
					},
					{
						key: 'status',
						label: 'Mod Status',
						children: (
					<Descriptions column={1} bordered size="small" styles={DESCRIPTION_LABEL_STYLES}>
						<Descriptions.Item label="Subscribed">{(!!currentRecord.subscribed).toString()}</Descriptions.Item>
						<Descriptions.Item label="Downloading">{(!!currentRecord.downloading).toString()}</Descriptions.Item>
						<Descriptions.Item label="Download Pending">{(!!currentRecord.downloadPending).toString()}</Descriptions.Item>
						<Descriptions.Item label="Needs Update">{(!!currentRecord.needsUpdate).toString()}</Descriptions.Item>
						<Descriptions.Item label="Is Installed">{(!!currentRecord.installed).toString()}</Descriptions.Item>
						<Descriptions.Item label="Is Active">
							{(!!activeCollection && activeCollection.mods.includes(currentRecord.uid)).toString()}
						</Descriptions.Item>
					</Descriptions>
						)
					}
				]}
			/>
		);
	};

	const renderDependenciesTab = (requiredModData: DisplayModData[], dependentModData: DisplayModData[], conflictingModData: DisplayModData[]) => {
		return (
			<ConfigProvider
				renderEmpty={() => {
					return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 5, marginBottom: 5 }} />;
				}}
			>
				{dependencyLookupError ? (
					<Space orientation="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
						<div className="StatusCallout StatusCallout--warning">
							<Text strong className="StatusCallout__title">
								Workshop dependency refresh failed
							</Text>
							<Text className="StatusCallout__body">{dependencyLookupError}</Text>
						</div>
						<Button
							size="small"
							onClick={() => {
								setDependencyLookupError(undefined);
							}}
						>
							Retry Workshop Dependency Lookup
						</Button>
					</Space>
				) : null}
				<Collapse
					className="ModDetailDependencies"
					defaultActiveKey={['required']}
					destroyOnHidden
					items={[
						{
							key: 'required',
							label: 'Required mods:',
							children: (
						<Table
							pagination={false}
							size="small"
							rowKey="uid"
							loading={loadingDependencies}
							dataSource={requiredModData}
							rowSelection={requiredDependencyRowSelection}
							columns={requiredDependencyColumns}
							scroll={{ x: 'max-content' }}
						/>
							)
						},
						{
							key: 'dependent',
							label: 'Dependent mods:',
							children: (
						<Table
							pagination={false}
							size="small"
							rowKey="uid"
							dataSource={dependentModData}
							rowSelection={dependentDependencyRowSelection}
							columns={dependentDependencyColumns}
							scroll={{ x: 'max-content' }}
						/>
							)
						},
						{
							key: 'conflict',
							label: 'Conflicting mods:',
							children: (
						<Table
							pagination={false}
							size="small"
							rowKey="uid"
							dataSource={conflictingModData}
							rowSelection={conflictingDependencyRowSelection}
							columns={conflictingDependencyColumns}
							scroll={{ x: 'max-content' }}
						/>
							)
						}
					]}
				/>
			</ConfigProvider>
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
	const activeTabContent =
		activeTabKey === 'inspect'
			? renderInspectTab()
			: activeTabKey === 'dependencies'
				? renderDependenciesTab(requiredModData, dependentModData, conflictingModData)
				: renderInfoTab();
	const tabItems = [
		{
			key: 'info',
			label: 'Info',
			children: activeTabKey === 'info' ? activeTabContent : null
		},
		{
			key: 'inspect',
			label: 'Inspect',
			children: activeTabKey === 'inspect' ? activeTabContent : null
		},
		{
			key: 'dependencies',
			label: 'Dependencies',
			children: activeTabKey === 'dependencies' ? activeTabContent : null
		}
	];

	return (
		<Content className="ModDetailFooter" style={bigDetails ? expandedStyle : compactStyle}>
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
					<Title level={5} style={{ margin: 0 }}>
						{currentRecord.name}
					</Title>
					<Text type="secondary">{currentRecordID ? `${currentRecordID} (${currentRecord.uid})` : currentRecord.uid}</Text>
				</div>
				<Space className="ModDetailFooterHeaderActions">
					<Tooltip title={halfLayoutMode === 'side' ? 'Use bottom split for half view' : 'Use side-by-side split for half view'}>
						<Button
							aria-label={halfLayoutMode === 'side' ? 'Switch to bottom split layout' : 'Switch to side-by-side split layout'}
							aria-pressed={halfLayoutMode === 'side'}
							icon={halfLayoutMode === 'side' ? <ColumnHeightOutlined /> : <ColumnWidthOutlined />}
							type="text"
							onClick={toggleHalfLayoutCallback}
						/>
					</Tooltip>
					<Tooltip title={bigDetails ? 'Return to split details' : 'Expand details to full view'}>
						<Button
							aria-label={bigDetails ? 'Return details to split view' : 'Expand details to full view'}
							aria-pressed={bigDetails}
							icon={bigDetails ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
							type="text"
							onClick={() => {
								expandFooterCallback(!bigDetails);
							}}
						/>
					</Tooltip>
					<Tooltip title="Close details">
						<Button aria-label="Close details" icon={<CloseOutlined />} type="text" onClick={closeFooterCallback} />
					</Tooltip>
				</Space>
			</div>
			<Row key="mod-details" className="ModDetailFooterBody" justify="space-between" gutter={16} style={{ flex: 1, minHeight: 0 }}>
				<Col xs={24} md={7} xl={4} className="ModDetailFooterPreviewCol" style={{ paddingLeft: 10, minHeight: 0 }}>
					{getImagePreview(currentRecord.preview, `${currentRecord.name} preview image`)}
				</Col>
				<Col xs={24} md={17} xl={20} className="ModDetailFooterContentCol" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
					<Content
						style={{
							paddingBottom: 10,
							paddingRight: 10,
							flex: 1,
							minHeight: 0,
							minWidth: 0,
							overflow: 'hidden',
							display: 'flex',
							flexDirection: 'column'
						}}
					>
						<Tabs
							className="ModDetailFooterTabs"
							activeKey={activeTabKey}
							onChange={setActiveTabKey}
							animated={false}
							destroyOnHidden
							items={tabItems}
						/>
					</Content>
				</Col>
			</Row>
		</Content>
	);
}

export default memo(ModDetailsFooter);
