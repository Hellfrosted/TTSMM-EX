import { memo, useCallback, useEffect, useMemo, useState, type Key } from 'react';
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
import {
	CheckSquareFilled,
	ClockCircleTwoTone,
	ColumnHeightOutlined,
	ColumnWidthOutlined,
	CloseOutlined,
	EditFilled,
	FolderOpenFilled,
	FullscreenExitOutlined,
	FullscreenOutlined,
	HddFilled,
	QuestionCircleFilled,
	StopTwoTone,
	WarningTwoTone
} from '@ant-design/icons';
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
import { formatDateStr } from 'util/Date';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import { writeConfig } from 'renderer/util/config-write';
import { WorkshopDescription } from 'renderer/util/workshop-description';

import missing from '../../../../assets/missing.png';
import steam from '../../../../assets/steam.png';
import ttmm from '../../../../assets/ttmm.png';

const { Content } = Layout;
const { Text, Title } = Typography;
const DESCRIPTION_LABEL_STYLES = { label: { width: 150 } };
const EMPTY_MOD_DESCRIPTORS: NonNullable<DisplayModData['dependsOn']> = [];

function getImageSrcFromType(type: ModType, size = 15) {
	switch (type) {
		case ModType.LOCAL:
			return (
				<Tooltip title="This is a local mod">
					<HddFilled width={size} />
				</Tooltip>
			);
		case ModType.TTQMM:
			return (
				<Tooltip title="This is a TTMM mod">
					<img src={ttmm} width={size} alt="" key="type" />
				</Tooltip>
			);
		case ModType.WORKSHOP:
			return (
				<Tooltip title="This is a Steam mod">
					<img src={steam} width={size} alt="" key="type" />
				</Tooltip>
			);
		default:
			return null;
	}
}

function getImagePreview(path?: string) {
	return (
		<Card className="ModDetailFooterPreview" style={{ width: '100%', padding: 10 }}>
			<Image src={path} fallback={missing} width="100%" />
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
	validateCollection: () => void;
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
					<WarningTwoTone twoToneColor="red" />
				</Tooltip>
			);
			updateType = 'danger';
			if (record.downloadPending) {
				updateIcon = (
					<Tooltip title="Download pending">
						<ClockCircleTwoTone twoToneColor="orange" />
					</Tooltip>
				);
				updateType = 'warning';
			}
			if (record.downloading) {
				updateIcon = (
					<Tooltip title="Downloading">
						<StopTwoTone spin twoToneColor="orange" />
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
			return <Tag color="gray">{displayID}</Tag>;
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
	const [requestedDependencyLookupUid, setRequestedDependencyLookupUid] = useState<string | null>(null);
	const [loadingDependencies, setLoadingDependencies] = useState(false);
	const { activeCollection, config: appConfig, updateState: updateAppState } = appState;

	useEffect(() => {
		if (
			activeTabKey !== 'dependencies' ||
			currentRecord.type !== ModType.WORKSHOP ||
			currentRecord.workshopID === undefined ||
			currentRecord.steamDependencies !== undefined ||
			requestedDependencyLookupUid === currentRecord.uid
		) {
			return;
		}

		let cancelled = false;
		const loadDependencies = async () => {
			const { uid, workshopID } = currentRecord;
			if (workshopID === undefined) {
				return;
			}

			setRequestedDependencyLookupUid(uid);
			setLoadingDependencies(true);
			try {
				const loaded = await api.fetchWorkshopDependencies(workshopID);
				if (!loaded) {
					api.logger.warn(`Failed to load workshop dependencies for ${workshopID}`);
				}
			} catch (error) {
				api.logger.error(`Failed to load workshop dependencies for ${workshopID}`);
				api.logger.error(error);
			} finally {
				if (!cancelled) {
					setLoadingDependencies(false);
				}
			}
		};

		void loadDependencies();

		return () => {
			cancelled = true;
		};
	}, [activeTabKey, currentRecord, requestedDependencyLookupUid]);

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
			const { type: recordType, uid: recordUid } = record;
			const isSelected =
				(type === DependenciesTableType.REQUIRED && !!dependencyKey && myIgnoredErrors.includes(dependencyKey)) ||
				(type === DependenciesTableType.CONFLICT && myIgnoredErrors.includes(recordUid));

			return (
				<Checkbox
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
								validateCollection();
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
						return <Tag color="red">Conflicts</Tag>;
					}
				}

				if (!selectedMods.includes(record.uid)) {
					if (!record.subscribed && record.workshopID && record.workshopID > 0) {
						return <Tag key="notSubscribed">Not subscribed</Tag>;
					}
					if (record.subscribed && !record.installed) {
						return <Tag key="notInstalled">Not installed</Tag>;
					}
					return null;
				}

				const errorTags: { text: string; color: string }[] = [];
				if (errors) {
					if (errors.incompatibleMods?.length) {
						errorTags.push({ text: 'Conflicts', color: 'red' });
					}
					if (errors.invalidId) {
						errorTags.push({ text: 'Invalid ID', color: 'volcano' });
					}
					if (errors.missingDependencies?.length) {
						errorTags.push({ text: 'Missing dependencies', color: 'orange' });
					}
					if (errors.notSubscribed) {
						errorTags.push({ text: 'Not subscribed', color: 'yellow' });
					} else if (errors.notInstalled) {
						errorTags.push({ text: 'Not installed', color: 'yellow' });
					} else if (errors.needsUpdate) {
						errorTags.push({ text: 'Needs update', color: 'yellow' });
					}
				}

				if (errorTags.length > 0) {
					return errorTags.map((tagConfig) => (
						<Tag key={tagConfig.text} color={tagConfig.color}>
							{tagConfig.text}
						</Tag>
					));
				}

				if (lastValidationStatus !== undefined) {
					return (
						<Tag key="OK" color="green">
							OK
						</Tag>
					);
				}

				return <Tag key="Pending">Pending</Tag>;
			}
		};

		const AUTHOR_SPECIFIED_DEPENDENCY_SCHEMA: ColumnType<DisplayModData> = {
			title: (
				<Tooltip title="Which version of the mod did the author say is the canonical dependency?">
					<QuestionCircleFilled />
				</Tooltip>
			),
			dataIndex: 'workshopID',
			render: (workshopID: bigint | undefined) => {
				if (!!workshopID && currentRecord.steamDependencies?.includes(workshopID)) {
					return (
						<Tooltip title="This is the mod the author specified as the canonical dependency">
							<CheckSquareFilled />
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
		const steamTags = currentRecord.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>) || [];
		const userTags =
			currentRecord.overrides?.tags?.map((tag) => (
				<Tag key={tag} color="blue">
					{tag}
				</Tag>
			)) || [];

		return (
			<Descriptions column={2} bordered size="small">
				<Descriptions.Item label="Author">{currentRecord.authors}</Descriptions.Item>
				<Descriptions.Item label="Tags">{steamTags.concat(userTags)}</Descriptions.Item>
				<Descriptions.Item label="Created">{formatDateStr(currentRecord.dateCreated)}</Descriptions.Item>
				<Descriptions.Item label="Installed">{formatDateStr(currentRecord.dateAdded)}</Descriptions.Item>
				<Descriptions.Item label="Description" span={2}>
					<WorkshopDescription description={currentRecord.description} />
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
				<Space>
					<Tooltip title={halfLayoutMode === 'side' ? 'Use bottom split for half view' : 'Use side-by-side split for half view'}>
						<Button
							icon={halfLayoutMode === 'side' ? <ColumnHeightOutlined /> : <ColumnWidthOutlined />}
							type="text"
							onClick={toggleHalfLayoutCallback}
						/>
					</Tooltip>
					<Button
						icon={bigDetails ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
						type="text"
						onClick={() => {
							expandFooterCallback(!bigDetails);
						}}
					/>
					<Button icon={<CloseOutlined />} type="text" onClick={closeFooterCallback} />
				</Space>
			</div>
			<Row key="mod-details" justify="space-between" gutter={16} style={{ flex: 1, minHeight: 0 }}>
				<Col span={2} lg={4} style={{ paddingLeft: 10, minHeight: 0 }}>
					{getImagePreview(currentRecord.preview)}
				</Col>
				<Col span={22} lg={20} style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
