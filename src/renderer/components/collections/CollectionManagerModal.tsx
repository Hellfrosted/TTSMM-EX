import { memo, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Typography, Row, Col, Input, Switch, Form, InputNumber } from 'antd';
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
	NotificationProps,
	getMainColumnMinWidth
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
	const activeCollectionName = appState.activeCollection?.name || 'this collection';

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
				<Title level={5}>Mods to review</Title>
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

	const setDraftColumnWidth = (columnId: MainColumnTitles, width?: number | null) => {
		const minimumWidth = getMainColumnMinWidth(columnId);
		setMainConfigDraft((currentConfig) => {
			const nextColumnWidthConfig = { ...(currentConfig.columnWidthConfig || {}) };
			if (typeof width === 'number') {
				nextColumnWidthConfig[columnId] = Math.max(minimumWidth, Math.round(width));
			} else {
				delete nextColumnWidthConfig[columnId];
			}

			return {
				...currentConfig,
				columnWidthConfig: Object.keys(nextColumnWidthConfig).length > 0 ? nextColumnWidthConfig : undefined
			};
		});
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
					title={`Delete "${activeCollectionName}"?`}
					open
					onCancel={closeModal}
					footer={[
						<Button
							key="cancel"
							type="primary"
							disabled={launchGameWithErrors}
							onClick={() => {
								closeModal();
							}}
						>
							Keep Collection
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
							Delete Collection
						</Button>
					]}
				>
					<p>Delete the saved collection from TTSMM-EX.</p>
					<p>Your installed mods and Steam subscriptions will stay unchanged.</p>
					<p>This cannot be undone.</p>
				</Modal>
			);
		case CollectionManagerModalType.DESELECTING_MOD_MANAGER: {
			const managerUID = getModManagerUID();
			const managerData: ModData = getByUID(appState.mods, managerUID)!;
			return (
				<Modal
					key="manager-warning-modal"
					title="Mod manager must stay enabled"
					open
					onCancel={closeModal}
					footer={[
						<Button key="launch" type="primary" onClick={closeModal}>
							OK
						</Button>
					]}
				>
					<p>TTSMM-EX needs one mod manager package enabled so TerraTech can load managed mods reliably.</p>
					<p>Your current manager is {`${managerData.name} (${appState.config.workshopID})`}.</p>
					<p>To switch managers, update the workshop item ID in Settings instead of disabling the current one here.</p>
				</Modal>
			);
		}
		case CollectionManagerModalType.ERRORS_FOUND:
			return (
				<Modal
					key="error-modal"
					className="CollectionValidationModal"
					title="Collection has blocking issues"
					width={760}
					open
					onCancel={() => {
						appState.updateState({ launchingGame: false });
						closeModal();
					}}
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
							Review Issues
						</Button>,
						<Button key="launch" danger type="primary" disabled={launchGameWithErrors} loading={launchGameWithErrors} onClick={launchAnyway}>
							Launch With Blocking Issues
						</Button>
					]}
				>
					<p>One or more enabled mods are missing required dependencies or conflict with another selected mod.</p>
					<p>Launching with this collection can cause missing content, startup failures, or save corruption.</p>
					<p>
						Mods that share the same Mod ID are incompatible. TerraTech only loads the first one it finds and ignores the rest.
					</p>
					{renderValidationIssueList()}
					<p>Review the list above before deciding whether to launch anyway.</p>
				</Modal>
			);
		case CollectionManagerModalType.WARNINGS_FOUND:
			return (
				<Modal
					key="warning-modal"
					className="CollectionValidationModal"
					title="Collection has warnings"
					width={760}
					open
					onCancel={() => {
						appState.updateState({ launchingGame: false });
						closeModal();
					}}
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
							Review Issues
						</Button>,
						<Button key="launch" danger type="primary" disabled={launchGameWithErrors} loading={launchGameWithErrors} onClick={launchAnyway}>
							Launch With Warnings
						</Button>
					]}
				>
					<p>Some mods could not be fully validated.</p>
					<p>This usually means the item is not subscribed, not installed yet, or still downloading from Steam.</p>
					{renderValidationIssueList()}
					<p>You can launch now, but review the affected mods first if the collection should be stable.</p>
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
					wrapClassName="CollectionSettingsModalWrap"
					title="Collection table settings"
					width={760}
					open
					onCancel={closeModal}
					footer={[
						<Button key="cancel-settings" disabled={savingConfig} onClick={closeModal}>
							Cancel
						</Button>,
						<Button
							key="save-settings"
							loading={savingConfig}
							disabled={savingConfig}
							type="primary"
							onClick={() => {
								const nextConfig = cloneAppConfig(appState.config);
								nextConfig.viewConfigs.main = {
									...mainConfigDraft,
									columnActiveConfig: mainConfigDraft.columnActiveConfig ? { ...mainConfigDraft.columnActiveConfig } : undefined,
									columnWidthConfig: mainConfigDraft.columnWidthConfig ? { ...mainConfigDraft.columnWidthConfig } : undefined
								};
								void saveConfig(nextConfig, closeModal);
							}}
						>
							Save Table Settings
						</Button>
					]}
				>
					<Form className="CollectionSettingsForm CollectionSettingsForm--dense">
						<div className="CollectionSettingsTopBar">
							<div className="CollectionSettingsTopCopy">
								<Title level={5}>Table layout</Title>
							</div>
								<div className="CollectionSettingsToggleCard">
									<div className="CollectionSettingsToggleCopy">
										<Text strong>Compact rows</Text>
									</div>
									<Switch
										aria-label="Use extra-compact rows in the main collection table"
										checked={!!mainConfigDraft.smallRows}
										onChange={(checked: boolean) => {
										setMainConfigDraft((currentConfig) => ({
											...currentConfig,
											smallRows: checked
										}));
									}}
								/>
							</div>
						</div>
						<div className="CollectionSettingsColumnsHeader" aria-hidden>
							{[0, 1].map((columnGroupIndex) => (
								<div className="CollectionSettingsColumnsHeaderGroup" key={columnGroupIndex}>
									<Text type="secondary">Column</Text>
									<Text type="secondary">Show</Text>
									<Text type="secondary">Saved width</Text>
								</div>
							))}
						</div>
						<div className="CollectionSettingsColumnsList">
							{Object.values(MainColumnTitles).map((id: string) => {
								const columnActiveConfig = mainConfigDraft.columnActiveConfig || {};
								const isChecked = columnActiveConfig[id] === undefined ? true : columnActiveConfig[id];
								const cannotDisable =
									isChecked &&
									((id === MainColumnTitles.ID && columnActiveConfig[MainColumnTitles.NAME] === false) ||
										(id === MainColumnTitles.NAME && columnActiveConfig[MainColumnTitles.ID] === false));
								const minimumWidth = getMainColumnMinWidth(id as MainColumnTitles);

								return (
									<div className="CollectionSettingsColumnRow" key={id}>
										<div className="CollectionSettingsColumnLabel">
											<Text strong>{id}</Text>
											{cannotDisable ? (
												<Text type="secondary" className="CollectionSettingsColumnHint">
													Name or ID must stay visible.
												</Text>
											) : null}
										</div>
										<div className="CollectionSettingsColumnSwitch">
											<Switch
												aria-label={`Show ${id} column`}
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
										</div>
										<div className="CollectionSettingsColumnWidth">
											<InputNumber
												aria-label={`Saved width for ${id} column`}
												min={minimumWidth}
												step={16}
												style={{ width: '100%' }}
												value={mainConfigDraft.columnWidthConfig?.[id]}
												placeholder={`Auto (${minimumWidth}px min)`}
												onChange={(value) => {
													setDraftColumnWidth(id as MainColumnTitles, typeof value === 'number' ? value : undefined);
												}}
											/>
										</div>
									</div>
								);
							})}
						</div>
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
					className="CollectionOverrideModal"
					title={`Edit Overrides For ${nextRecord.name}`}
					width={620}
					open
					onCancel={closeModal}
					footer={[
						<Button key="cancel-edit" disabled={savingConfig} onClick={closeModal}>
							Cancel
						</Button>,
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
					<Form className="ModOverrideForm" layout="vertical">
						<Paragraph className="CollectionModalIntro" type="secondary">
							Override the mod ID when you need this entry to satisfy a specific dependency target without changing the original mod metadata.
						</Paragraph>
						<Row gutter={[16, 16]} className="ModOverrides">
							<Col xs={24} md={12} key="override-id">
								<div className="ModOverridesPane">
									<Form.Item key="override-id" name="override-id" label="Override ID">
										<Input
											value={overrideId}
											onChange={(event) => {
												setOverrideId(event.target.value);
											}}
										/>
									</Form.Item>
								</div>
							</Col>
							<Col xs={24} md={12} key="custom-tags">
								<div className="ModOverridesPane">
									<Form.Item key="customTags" name="customTags" label="Current User Tags">
										<Input disabled value={nextRecord.overrides?.tags?.join(', ') || ''} />
									</Form.Item>
								</div>
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
