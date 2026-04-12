import { memo, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Typography, Row, Col, Divider, Input, Switch, Form } from 'antd';
import {
	AppConfig,
	AppState,
	CollectionErrors,
	CollectionManagerModalType,
	CollectionViewType,
	getByUID,
	getModDescriptorDisplayName,
	MainColumnTitles,
	MainCollectionConfig,
	ModData,
	ModType,
	NotificationProps
} from 'model';
import api from 'renderer/Api';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';

const { Paragraph, Title, Text } = Typography;

interface CollectionManagerModalProps {
	appState: AppState;
	modalType: CollectionManagerModalType;
	launchGameWithErrors: boolean;
	currentView: CollectionViewType;
	collectionErrors?: CollectionErrors;
	launchAnyway: () => void;
	openNotification: (props: NotificationProps, type?: 'info' | 'error' | 'success' | 'warn') => void;
	closeModal: () => void;
	currentRecord?: ModData;
	deleteCollection: () => void;
}

const DEFAULT_MAIN_CONFIG: MainCollectionConfig = {};

function CollectionManagerModal({
	appState,
	modalType,
	launchGameWithErrors,
	launchAnyway,
	openNotification,
	currentView,
	collectionErrors,
	closeModal,
	deleteCollection,
	currentRecord
}: CollectionManagerModalProps) {
	const [savingConfig, setSavingConfig] = useState(false);
	const [mainConfigDraft, setMainConfigDraft] = useState<MainCollectionConfig>(DEFAULT_MAIN_CONFIG);
	const [overrideId, setOverrideId] = useState('');

	useEffect(() => {
		if (modalType === CollectionManagerModalType.VIEW_SETTINGS) {
			setMainConfigDraft(appState.config.viewConfigs.main ? { ...appState.config.viewConfigs.main } : {});
		}
		if (modalType === CollectionManagerModalType.EDIT_OVERRIDES) {
			setOverrideId(currentRecord?.overrides?.id || '');
		}
	}, [appState.config.viewConfigs.main, currentRecord, modalType]);

	const validationIssueSummaries = useMemo(() => {
		if (!collectionErrors) {
			return [];
		}

		return Object.entries(collectionErrors)
			.map(([uid, modErrors]) => {
				const modData = getByUID(appState.mods, uid);
				const issues: string[] = [];

				if (modErrors.invalidId) {
					issues.push('Invalid mod ID');
				}
				if (modErrors.missingDependencies?.length) {
					issues.push(`Missing dependencies: ${modErrors.missingDependencies.map((descriptor) => getModDescriptorDisplayName(descriptor)).join(', ')}`);
				}
				if (modErrors.incompatibleMods?.length) {
					issues.push(
						`Conflicts with: ${modErrors.incompatibleMods
							.map((conflictingUid) => getByUID(appState.mods, conflictingUid)?.name || conflictingUid)
							.join(', ')}`
					);
				}
				if (modErrors.notSubscribed) {
					issues.push('Not subscribed');
				}
				if (modErrors.notInstalled) {
					issues.push('Not installed');
				}
				if (modErrors.needsUpdate) {
					issues.push('Needs update');
				}

				return {
					uid,
					label: modData?.name || modData?.id || uid,
					issues
				};
			})
			.filter((summary) => summary.issues.length > 0)
			.sort((left, right) => left.label.localeCompare(right.label));
	}, [appState.mods, collectionErrors]);

	const renderValidationIssueList = () => {
		if (validationIssueSummaries.length === 0) {
			return null;
		}

		return (
			<div style={{ marginTop: 20 }}>
				<Title level={5}>Affected Mods</Title>
				<div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 8 }}>
					{validationIssueSummaries.map((summary) => (
						<div key={summary.uid} style={{ marginBottom: 14 }}>
							<Text strong>{summary.label}</Text>
							<br />
							<Text type="secondary">{summary.uid}</Text>
							{summary.issues.map((issue) => (
								<Paragraph key={`${summary.uid}-${issue}`} style={{ marginBottom: 0, marginTop: 4 }}>
									{issue}
								</Paragraph>
							))}
						</div>
					))}
				</div>
			</div>
		);
	};

	const getModManagerUID = () => {
		return `${ModType.WORKSHOP}:${appState.config.workshopID}`;
	};

	const saveConfig = async (nextConfig: AppConfig, afterSave?: () => void) => {
		setSavingConfig(true);
		try {
			const updateSuccess = await api.updateConfig(nextConfig);
			if (!updateSuccess) {
				throw new Error('Config write was rejected');
			}
			appState.updateState({ config: nextConfig });
			afterSave?.();
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
		} finally {
			setSavingConfig(false);
		}
	};

	switch (modalType) {
		case CollectionManagerModalType.WARN_DELETE:
			return (
				<Modal
					key="warning-modal"
					title="Delete Collection?"
					open
					closable={false}
					footer={[
						<Button
							key="cancel"
							type="primary"
							disabled={launchGameWithErrors}
							onClick={() => {
								closeModal();
							}}
						>
							Don&apos;t Delete
						</Button>,
						<Button
							key="delete"
							danger
							type="primary"
							disabled={launchGameWithErrors}
							loading={launchGameWithErrors}
							onClick={() => {
								deleteCollection();
								closeModal();
							}}
						>
							Delete
						</Button>
					]}
				>
					<p>Are you sure you want to delete this collection?</p>
					<p>THIS CANNOT BE UNDONE</p>
				</Modal>
			);
		case CollectionManagerModalType.DESELECTING_MOD_MANAGER: {
			const managerUID = getModManagerUID();
			const managerData: ModData = getByUID(appState.mods, managerUID)!;
			return (
				<Modal
					key="manager-warning-modal"
					title="Useless Operation"
					open
					closable={false}
					footer={[
						<Button key="launch" type="primary" onClick={closeModal}>
							OK
						</Button>
					]}
				>
					<p>You are attempting to deselect the mod manager.</p>
					<p>An external mod manager is current required for TerraTech to load some mods properly.</p>
					<p>Your current selected manager is {`${managerData.name} (${appState.config.workshopID})`}</p>
					<p>If you would like to change your manager, do so by entering the workshop file ID in the settings tab.</p>
				</Modal>
			);
		}
		case CollectionManagerModalType.ERRORS_FOUND:
			return (
				<Modal
					key="error-modal"
					title="Errors Found in Configuration"
					width={760}
					open
					closable={false}
					footer={[
						<Button
							key="cancel"
							type="primary"
							disabled={launchGameWithErrors}
							onClick={() => {
								appState.updateState({ launchingGame: false });
								closeModal();
							}}
						>
							Manually Fix
						</Button>,
						<Button key="launch" danger type="primary" disabled={launchGameWithErrors} loading={launchGameWithErrors} onClick={launchAnyway}>
							Launch Anyway
						</Button>
					]}
				>
					<p>One or more mods have either missing dependencies, or is selected alongside incompatible mods.</p>
					<p>Launching the game with this mod list may lead to crashes, or even save game corruption.</p>
					<p>
						Mods that share the same Mod ID (Not the same as Workshop ID) are explicitly incompatible, and only the first one TerraTech loads
						will be used. All others will be ignored.
					</p>
					{renderValidationIssueList()}
					<p>Do you want to continue anyway?</p>
				</Modal>
			);
		case CollectionManagerModalType.WARNINGS_FOUND:
			return (
				<Modal
					key="warning-modal"
					title="Minor Errors Found in Configuration"
					width={760}
					open
					closable={false}
					footer={[
						<Button
							key="cancel"
							type="primary"
							disabled={launchGameWithErrors}
							onClick={() => {
								appState.updateState({ launchingGame: false });
								closeModal();
							}}
						>
							Manually Fix
						</Button>,
						<Button key="launch" danger type="primary" disabled={launchGameWithErrors} loading={launchGameWithErrors} onClick={launchAnyway}>
							Launch Anyway
						</Button>
					]}
				>
					<p>Unable to validate one or more mods in the collection.</p>
					<p>This is probably because you are not subscribed to them.</p>
					{renderValidationIssueList()}
					<p>Do you want to continue anyway?</p>
				</Modal>
			);
		case CollectionManagerModalType.VIEW_SETTINGS:
			if (currentView !== CollectionViewType.MAIN) {
				return null;
			}

			return (
				<Modal
					key="settings-modal"
					className="CollectionSettingsModal"
					title="Editing Collection View Settings"
					open
					closable={false}
					footer={[
						<Button
							key="save-settings"
							loading={savingConfig}
							disabled={savingConfig}
							type="primary"
							onClick={() => {
								const nextConfig = cloneAppConfig(appState.config);
								nextConfig.viewConfigs.main = {
									...mainConfigDraft,
									columnActiveConfig: mainConfigDraft.columnActiveConfig ? { ...mainConfigDraft.columnActiveConfig } : undefined
								};
								void saveConfig(nextConfig, closeModal);
							}}
						>
							Save Settings
						</Button>
					]}
				>
					<Form className="CollectionSettingsForm">
						<Row justify="space-between" gutter={16} className="CollectionSettings">
							<Col span={10} key="misc-settings">
								<Form.Item key="smallRows" name="smallRows" label="Compact Rows">
									<Switch
										size="small"
										checked={!!mainConfigDraft.smallRows}
										onChange={(checked: boolean) => {
											setMainConfigDraft((currentConfig) => ({
												...currentConfig,
												smallRows: checked
											}));
										}}
									/>
								</Form.Item>
							</Col>
							<Col span={1} key="divider" style={{ height: '100%' }}>
								<Divider orientation="vertical" style={{ height: '25em' }} />
							</Col>
							<Col span={13} key="columns" className="CollectionColumnSelection">
								<Paragraph>
									<Title level={5}>Select visible columns</Title>
								</Paragraph>
								{Object.values(MainColumnTitles).map((id: string) => {
									const columnActiveConfig = mainConfigDraft.columnActiveConfig || {};
									const isChecked = columnActiveConfig[id] === undefined ? true : columnActiveConfig[id];
									const cannotDisable =
										isChecked &&
										((id === MainColumnTitles.ID && columnActiveConfig[MainColumnTitles.NAME] === false) ||
											(id === MainColumnTitles.NAME && columnActiveConfig[MainColumnTitles.ID] === false));

									return (
										<Form.Item
											key={id}
											name={id}
											label={id}
											tooltip={
												cannotDisable
													? {
															styles: { container: { minWidth: 300 } },
															title: <Text>{`Must enable either the ${MainColumnTitles.ID} or ${MainColumnTitles.NAME} column`}</Text>
													  }
													: undefined
											}
										>
											<Switch
												size="small"
												checked={isChecked}
												disabled={cannotDisable}
												onChange={(checked: boolean) => {
													setMainConfigDraft((currentConfig) => ({
														...currentConfig,
														columnActiveConfig: {
															...(currentConfig.columnActiveConfig || {}),
															[id]: checked
														}
													}));
												}}
											/>
										</Form.Item>
									);
								})}
							</Col>
						</Row>
					</Form>
				</Modal>
			);
		case CollectionManagerModalType.EDIT_OVERRIDES: {
			const nextRecord = currentRecord;
			if (!nextRecord) {
				return null;
			}

			return (
				<Modal
					key="manager-override-modal"
					title={`Edit Overrides For ${nextRecord.name}`}
					open
					closable={false}
					footer={[
						<Button
							key="save-settings"
							loading={savingConfig}
							disabled={savingConfig}
							type="primary"
							onClick={() => {
								const nextConfig = cloneAppConfig(appState.config);
								const nextOverride = nextConfig.userOverrides.get(nextRecord.uid) || {};
								if (overrideId) {
									nextOverride.id = overrideId;
									nextConfig.userOverrides.set(nextRecord.uid, nextOverride);
								} else {
									delete nextOverride.id;
									if (Object.keys(nextOverride).length === 0) {
										nextConfig.userOverrides.delete(nextRecord.uid);
									} else {
										nextConfig.userOverrides.set(nextRecord.uid, nextOverride);
									}
								}
								void saveConfig(nextConfig, () => {
									closeModal();
									appState.updateState({ loadingMods: true });
								});
							}}
						>
							Save Settings
						</Button>
					]}
				>
					<Form className="ModOverrideForm">
						<Row justify="space-between" gutter={16} className="ModOverrides">
							<Col span={10} key="overrides">
								<Form.Item key="override-id" name="override-id" label="Override ID">
									<Input
										value={overrideId}
										onChange={(event) => {
											setOverrideId(event.target.value);
										}}
									/>
								</Form.Item>
								<Form.Item key="customTags" name="customTags" label="User Tags">
									<Input disabled value={nextRecord.overrides?.tags?.join(', ') || ''} />
								</Form.Item>
							</Col>
						</Row>
					</Form>
				</Modal>
			);
		}
		default:
			return null;
	}
}

export default memo(CollectionManagerModal);
