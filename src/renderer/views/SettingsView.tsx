import { memo, useCallback, useEffect, useState } from 'react';
import { AppConfigKeys, AppState, LogLevel, NLogLevel, SettingsViewModalType } from 'model';
import { Layout, Form, Input, InputNumber, Switch, Button, Space, Select, Row, Col, Modal, Tag, Typography } from 'antd';
import { useOutletContext } from 'react-router-dom';
import CloseOutlined from '@ant-design/icons/es/icons/CloseOutlined';
import EditFilled from '@ant-design/icons/es/icons/EditFilled';
import FolderOutlined from '@ant-design/icons/es/icons/FolderOutlined';
import PlusOutlined from '@ant-design/icons/es/icons/PlusOutlined';
import { createEditingConfig, useSettingsForm } from 'renderer/hooks/useSettingsForm';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { APP_TAG_STYLES } from 'renderer/theme';
import { validateSettingsPath } from 'util/Validation';

const { Content } = Layout;
const { Search } = Input;
const { Paragraph, Title } = Typography;

interface SettingsViewProps {
	appState: AppState;
}

const SETTINGS_COMPACT_CONTROL_STYLE = { width: '100%', minWidth: 0 } as const;
const SETTINGS_LOGGER_LEVEL_STYLE = { flex: '1 1 12rem', minWidth: 0, width: '100%' } as const;
const SETTINGS_WORKSHOP_ID_STYLE = { flex: '1 1 12rem', minWidth: 0, width: '100%' } as const;
const SETTINGS_LOGGER_ROW_STYLE = { display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' } as const;
const SETTINGS_LOGGER_GROUP_STYLE = { flex: '2 1 16rem', minWidth: 0 } as const;
const SETTINGS_LOGGER_ID_INPUT_STYLE = { flex: '1 1 auto', minWidth: 0 } as const;

const APP_LOG_LEVEL_TAG_STYLE = {
	[LogLevel.ERROR]: APP_TAG_STYLES.danger,
	[LogLevel.WARN]: APP_TAG_STYLES.warning,
	[LogLevel.INFO]: APP_TAG_STYLES.info,
	[LogLevel.VERBOSE]: APP_TAG_STYLES.accent,
	[LogLevel.DEBUG]: APP_TAG_STYLES.neutral,
	[LogLevel.SILLY]: APP_TAG_STYLES.neutral
} as const;

const NLOG_LEVEL_TAG_STYLE = {
	[NLogLevel.OFF]: APP_TAG_STYLES.neutral,
	[NLogLevel.FATAL]: APP_TAG_STYLES.danger,
	[NLogLevel.ERROR]: APP_TAG_STYLES.danger,
	[NLogLevel.WARN]: APP_TAG_STYLES.warning,
	[NLogLevel.INFO]: APP_TAG_STYLES.info,
	[NLogLevel.DEBUG]: APP_TAG_STYLES.accent,
	[NLogLevel.TRACE]: APP_TAG_STYLES.neutral
} as const;

function SettingsViewComponent({ appState }: SettingsViewProps) {
	const [form] = Form.useForm();
	const { madeConfigEdits, savingConfig, configErrors } = appState;
	const isLinux = window.electron.platform === 'linux';
	const { openNotification } = useNotifications();
	const [loggingOverridesOpen, setLoggingOverridesOpen] = useState(false);
	const {
		editingConfig,
		selectingDirectory,
		modalType,
		editingContextIndex,
		editingContext,
		setField,
		updateLogConfig,
		addLogConfig,
		removeLogConfig,
		selectPath,
		saveChanges,
		cancelChanges,
		openLogEditModal,
		openWorkshopIdModal,
		closeModal
	} = useSettingsForm(appState);

	useEffect(() => {
		form.setFieldsValue(createEditingConfig(appState.config));
	}, [appState.config, form]);

	useEffect(() => {
		if (editingConfig.editingLogConfig.length > 0) {
			setLoggingOverridesOpen(true);
		}
	}, [editingConfig.editingLogConfig.length]);

	const updateConfigErrors = useCallback(
		(field: string, error?: string) => {
			const currentError = configErrors?.[field];
			if (currentError === error) {
				return;
			}

			const nextErrors = { ...(configErrors || {}) };
			if (error) {
				nextErrors[field] = error;
			} else {
				delete nextErrors[field];
			}
			appState.updateState({ configErrors: nextErrors });
		},
		[appState, configErrors]
	);

	const validateFile = useCallback(
		async (field: string, value: string) => {
			if (!value || value.length === 0) {
				if (field === AppConfigKeys.LOCAL_DIR || field === AppConfigKeys.LOGS_DIR) {
					updateConfigErrors(field);
					return;
				}

				const message = 'Path is required';
				updateConfigErrors(field, message);
				throw new Error(message);
			}

			try {
				const error = await validateSettingsPath(field, value);
				if (error) {
					updateConfigErrors(field, error);
					throw new Error(error);
				}

				updateConfigErrors(field);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				updateConfigErrors(field, message);
				throw new Error(message);
			}
		},
		[updateConfigErrors]
	);

	const validateLoggerID = useCallback(
		async (loggerID: string) => {
			const duplicates = editingConfig.editingLogConfig.filter((config) => config.loggerID === loggerID);
			if (duplicates.length > 1) {
				throw new Error('Duplicate logger IDs');
			}
		},
		[editingConfig.editingLogConfig]
	);

	const handleSelectPath = useCallback(
		async (target: AppConfigKeys.LOCAL_DIR | AppConfigKeys.LOGS_DIR | AppConfigKeys.GAME_EXEC, directory: boolean, title: string) => {
			try {
				const selectedPath = await selectPath(target, directory, title);
				if (!selectedPath) {
					return;
				}

				form.setFieldValue(target, selectedPath);
				void form.validateFields([target]).catch(() => undefined);
			} catch (error) {
				openNotification(
					{
						message: 'Could not open the file picker',
						description: error instanceof Error ? error.message : String(error),
						placement: 'bottomLeft',
						duration: null
					},
					'error'
				);
			}
		},
		[form, openNotification, selectPath]
	);

	const handleSaveChanges = useCallback(async () => {
		const result = await saveChanges();
		if (result.ok) {
			openNotification(
				{
					message: 'Settings saved',
					description: result.reloadRequired
						? 'Mod data will refresh using the updated paths and manager settings.'
						: 'Your changes are available now.',
					placement: 'bottomLeft',
					duration: 2
				},
				'success'
			);
			return;
		}

		openNotification(
			{
				message: 'Could not save settings',
				description: result.message,
				placement: 'bottomLeft',
				duration: null
			},
			'error'
		);
	}, [openNotification, saveChanges]);

	return (
		<Layout style={{ width: '100%' }}>
			{modalType === SettingsViewModalType.LOG_EDIT && editingContext ? (
				<Modal
					key="logger-name-modal"
					title="Edit Logger ID"
					open
					onCancel={() => {
						closeModal({ restoreSnapshot: true });
					}}
					footer={[
						<Button
							key="cancel-settings"
							onClick={() => {
								closeModal({ restoreSnapshot: true });
							}}
						>
							Cancel
						</Button>,
						<Button
							key="save-settings"
							type="primary"
							onClick={() => {
								closeModal();
							}}
						>
							Done
						</Button>
					]}
				>
					<Form className="LoggerNameForm">
						<Form.Item key="logger-id" name="logger-id" label="Logger ID">
							<Input
								value={editingContext.loggerID}
								onChange={(event) => {
									if (editingContextIndex === undefined) {
										return;
									}

									updateLogConfig(editingContextIndex, { loggerID: event.target.value });
								}}
							/>
						</Form.Item>
					</Form>
				</Modal>
			) : null}
			{modalType === SettingsViewModalType.WORKSHOP_ID_EDIT ? (
				<Modal
					key="workshop-id-modal"
					title="Select Mod Manager Workshop Item"
					open
					onCancel={() => {
						closeModal({ restoreSnapshot: true });
					}}
					footer={[
						<Button
							type="primary"
							key="no-changes"
							onClick={() => {
								setField(AppConfigKeys.MANAGER_ID, appState.config.workshopID);
								closeModal();
							}}
						>
							Keep Current Manager
						</Button>,
						<Button
							key="cancel-edit"
							onClick={() => {
								closeModal({ restoreSnapshot: true });
							}}
						>
							Cancel
						</Button>,
						<Button
							key="save-settings"
							type="primary"
							onClick={() => {
								closeModal();
							}}
						>
							Save Manager ID
						</Button>
					]}
				>
					<Form className="WorkshopIDForm">
						<Form.Item key="workshop-id" name="workshop-id" label="Workshop item ID">
							<InputNumber
								value={editingConfig.workshopID.toString()}
								onChange={(value) => {
									setField(AppConfigKeys.MANAGER_ID, BigInt(value || 0));
								}}
								style={{ width: '100%' }}
							/>
						</Form.Item>
					</Form>
				</Modal>
			) : null}
			<Content className="Settings">
				<div className="SettingsHeader">
					<Title level={3} style={{ marginBottom: 0 }}>
						Settings
					</Title>
					<Paragraph type="secondary" className="SettingsIntro">
						Manage game paths, launch behavior, and logging for this TerraTech install.
					</Paragraph>
				</div>
				<Form
					form={form}
					onFinish={() => {
						void handleSaveChanges();
					}}
					labelWrap
					labelCol={{ xs: 24, sm: 24, lg: 10, xl: 9, xxl: 6 }}
					wrapperCol={{ xs: 24, sm: 24, lg: 14, xl: 15, xxl: 18 }}
					initialValues={{ remember: true }}
					autoComplete="off"
					className="SettingsForm"
					name="control-ref"
				>
					<Row align="stretch" gutter={[24, 20]} className="CollectionSettings SettingsPaneGrid" style={{ marginBottom: 10 }}>
						<Col xs={24} lg={14} key="misc-app-settings" className="SettingsPaneColumn MiscAppSettings">
							<div className="SettingsPane">
								<Form.Item
									name="localDir"
									label="Local Mods Folder"
									tooltip={{
										styles: { container: { minWidth: 300 } },
										title: (
											<div>
												<p>Optional. Use this only when you develop or test local mods.</p>
												<p>Point it to TerraTech&apos;s LocalMods folder under Steam/steamapps/common/TerraTech.</p>
											</div>
										)
									}}
									rules={[
										{
											validator: async (_, value) => validateFile(AppConfigKeys.LOCAL_DIR, value)
										}
									]}
									help={configErrors?.localDir}
									validateStatus={configErrors?.localDir ? 'error' : undefined}
								>
									<Search
										disabled={selectingDirectory}
										value={editingConfig.localDir}
										enterButton={<Button aria-label="Browse for the Local Mods directory" icon={<FolderOutlined />} />}
										onChange={(event) => {
											setField(AppConfigKeys.LOCAL_DIR, event.target.value);
										}}
										onSearch={() => {
											void handleSelectPath(AppConfigKeys.LOCAL_DIR, true, 'Select TerraTech LocalMods directory');
										}}
									/>
								</Form.Item>
								<Form.Item
									label="TerraTech Executable"
									tooltip={{
										styles: { container: { minWidth: 300 } },
										title: (
											<div>
												{isLinux ? (
													<>
														<p>Unused on Linux.</p>
														<p>
															The Linux build launches TerraTech through Steam, so there is no executable path to discover or browse here.
														</p>
													</>
												) : (
													<>
														<p>Path to TerraTech&apos;s main executable.</p>
														<p>It is usually under Steam/steamapps/common/TerraTech, but the exact file varies by platform.</p>
													</>
												)}
											</div>
										)
									}}
									{...(isLinux
										? {
												extra: 'Unused on Linux. TerraTech is launched through Steam.'
											}
										: {
												name: 'gameExec',
												rules: [
													{
														required: true,
														validator: async (_: unknown, value: string) => validateFile(AppConfigKeys.GAME_EXEC, value)
													}
												]
											})}
									help={configErrors?.gameExec}
									validateStatus={configErrors?.gameExec ? 'error' : undefined}
								>
									{isLinux ? (
										<Input disabled value="Launched through Steam on Linux" />
									) : (
										<Search
											disabled={selectingDirectory}
											value={editingConfig.gameExec}
											enterButton={<Button aria-label="Browse for the TerraTech executable" icon={<FolderOutlined />} />}
											onSearch={() => {
												void handleSelectPath(AppConfigKeys.GAME_EXEC, false, 'Select TerraTech Executable');
											}}
											onChange={(event) => {
												setField(AppConfigKeys.GAME_EXEC, event.target.value);
											}}
										/>
									)}
								</Form.Item>
								<Form.Item
									name="logsDir"
									label="Logs Folder"
									tooltip={{
										styles: { container: { minWidth: 300 } },
										title: (
											<div>
												<p>Optional. Use this if you want TTSMM-EX to write logs somewhere other than the default app data folder.</p>
												<p>Point it at a folder you can keep between launches while troubleshooting.</p>
											</div>
										)
									}}
									rules={[
										{
											validator: async (_, value) => validateFile(AppConfigKeys.LOGS_DIR, value)
										}
									]}
									help={configErrors?.logsDir}
									validateStatus={configErrors?.logsDir ? 'error' : undefined}
								>
									<Search
										disabled={selectingDirectory}
										value={editingConfig.logsDir}
										enterButton={<Button aria-label="Browse for the logs directory" icon={<FolderOutlined />} />}
										onChange={(event) => {
											setField(AppConfigKeys.LOGS_DIR, event.target.value);
										}}
										onSearch={() => {
											void handleSelectPath(AppConfigKeys.LOGS_DIR, true, 'Select directory for logs');
										}}
									/>
								</Form.Item>
								<Form.Item name="closeOnLaunch" label="Close on Game Launch">
									<Switch
										aria-label="Close the app after launching TerraTech"
										checked={editingConfig.closeOnLaunch}
										onChange={(checked) => {
											setField('closeOnLaunch', checked);
										}}
									/>
								</Form.Item>
								<Form.Item
									name="pureVanilla"
									label="Pure Vanilla"
									tooltip={{
										styles: { container: { minWidth: 300 } },
										title: (
											<div>
												<p>Launch TerraTech without the integrated mod loader when no other mods are enabled.</p>
											</div>
										)
									}}
								>
									<Switch
										aria-label="Launch TerraTech without the integrated mod loader when no other mods are enabled"
										checked={editingConfig.pureVanilla}
										onChange={(checked) => {
											setField('pureVanilla', checked);
										}}
									/>
								</Form.Item>
								<Form.Item
									name="logLevel"
									label="App Log Level"
									tooltip={{
										styles: { container: { minWidth: 300 } },
										title: (
											<div>
												<p>Controls how much this desktop app logs.</p>
												<p>It does not change TerraTech logging or the in-game mod manager&apos;s logging.</p>
												<p>Use Warn or Error unless you are troubleshooting a specific issue.</p>
											</div>
										)
									}}
									rules={[{ required: false }]}
								>
									<Select
										aria-label="App logging level"
										value={editingConfig.logLevel}
										onChange={(value) => {
											setField('logLevel', value);
										}}
										style={SETTINGS_COMPACT_CONTROL_STYLE}
									>
										<Select.Option value={LogLevel.ERROR}>
											<Tag style={APP_LOG_LEVEL_TAG_STYLE[LogLevel.ERROR]}>ERROR</Tag>
										</Select.Option>
										<Select.Option value={LogLevel.WARN}>
											<Tag style={APP_LOG_LEVEL_TAG_STYLE[LogLevel.WARN]}>WARN</Tag>
										</Select.Option>
										<Select.Option value={LogLevel.INFO}>
											<Tag style={APP_LOG_LEVEL_TAG_STYLE[LogLevel.INFO]}>INFO</Tag>
										</Select.Option>
										<Select.Option value={LogLevel.VERBOSE}>
											<Tag style={APP_LOG_LEVEL_TAG_STYLE[LogLevel.VERBOSE]}>VERBOSE</Tag>
										</Select.Option>
										<Select.Option value={LogLevel.DEBUG}>
											<Tag style={APP_LOG_LEVEL_TAG_STYLE[LogLevel.DEBUG]}>DEBUG</Tag>
										</Select.Option>
										<Select.Option value={LogLevel.SILLY}>
											<Tag style={APP_LOG_LEVEL_TAG_STYLE[LogLevel.SILLY]}>SILLY</Tag>
										</Select.Option>
									</Select>
								</Form.Item>
								<Form.Item
									name="workshopID"
									label="Manager Workshop ID"
									rules={[{ required: true }]}
									tooltip={{
										styles: { container: { minWidth: 300 } },
										title: (
											<div>
												<p>The Steam Workshop item ID for the mod manager package this app should launch with.</p>
											</div>
										)
									}}
								>
									<Space.Compact style={{ width: '100%' }}>
										<InputNumber
											aria-label="Current mod manager workshop item ID"
											value={editingConfig.workshopID.toString()}
											disabled
											style={SETTINGS_WORKSHOP_ID_STYLE}
										/>
										<Button
											aria-label="Edit the mod manager workshop item ID"
											icon={<EditFilled />}
											type="primary"
											onClick={() => {
												openWorkshopIdModal();
											}}
										/>
									</Space.Compact>
								</Form.Item>
							</div>
						</Col>
						<Col xs={24} lg={10} key="additional-commands" className="SettingsPaneColumn">
							<div className="SettingsPane">
								<Form.Item name="extraParams" label="Launch Arguments">
									<Input
										value={editingConfig.extraParams}
										onChange={(event) => {
											setField('extraParams', event.target.value);
										}}
									/>
								</Form.Item>
								<details
									className="SettingsDisclosure"
									open={loggingOverridesOpen}
									onToggle={(event) => {
										setLoggingOverridesOpen(event.currentTarget.open);
									}}
								>
									<summary className="SettingsDisclosureSummary">Logging Overrides</summary>
									<div className="SettingsDisclosureBody">
										{editingConfig.editingLogConfig.map((config, index) => {
											const id = ['editingLogConfig', index, 'loggerID'];

											return (
												<Form.Item
													name={id}
													key={`${config.loggerID}-${index}`}
													label={`Override ${index + 1}`}
													rules={[
														{
															validator: async () => validateLoggerID(config.loggerID)
														}
													]}
													style={{ width: '100%' }}
												>
													<div style={SETTINGS_LOGGER_ROW_STYLE}>
														<Select
															aria-label={`Logging level for override ${index + 1}`}
															value={config.level}
															onChange={(value) => {
																updateLogConfig(index, { level: value as NLogLevel });
															}}
															style={SETTINGS_LOGGER_LEVEL_STYLE}
														>
															<Select.Option value={NLogLevel.OFF}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.OFF]}>OFF</Tag>
															</Select.Option>
															<Select.Option value={NLogLevel.FATAL}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.FATAL]}>FATAL</Tag>
															</Select.Option>
															<Select.Option value={NLogLevel.ERROR}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.ERROR]}>ERROR</Tag>
															</Select.Option>
															<Select.Option value={NLogLevel.WARN}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.WARN]}>WARN</Tag>
															</Select.Option>
															<Select.Option value={NLogLevel.INFO}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.INFO]}>INFO</Tag>
															</Select.Option>
															<Select.Option value={NLogLevel.DEBUG}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.DEBUG]}>DEBUG</Tag>
															</Select.Option>
															<Select.Option value={NLogLevel.TRACE}>
																<Tag style={NLOG_LEVEL_TAG_STYLE[NLogLevel.TRACE]}>TRACE</Tag>
															</Select.Option>
														</Select>
														<Space.Compact style={SETTINGS_LOGGER_GROUP_STYLE}>
															<Input style={SETTINGS_LOGGER_ID_INPUT_STYLE} value={config.loggerID} disabled />
															<Button
																aria-label={`Edit logger override ${index + 1}`}
																icon={<EditFilled />}
																type="primary"
																onClick={() => {
																	openLogEditModal(index);
																}}
															/>
														</Space.Compact>
														<Button
															aria-label={`Remove logger override ${index + 1}`}
															icon={<CloseOutlined />}
															danger
															type="primary"
															onClick={() => {
																removeLogConfig(index);
															}}
														/>
													</div>
												</Form.Item>
											);
										})}
										<div className="SettingsDisclosureActions">
											<Button
												icon={<PlusOutlined />}
												onClick={() => {
													addLogConfig();
												}}
												type="primary"
											>
												Add Override
											</Button>
										</div>
									</div>
								</details>
							</div>
						</Col>
					</Row>
					<Space size="middle" align="center" className="SettingsActions" wrap>
						<Button disabled={!madeConfigEdits} htmlType="button" onClick={cancelChanges}>
							Reset Changes
						</Button>
						<Button
							loading={savingConfig}
							disabled={!madeConfigEdits || (!!configErrors && Object.keys(configErrors).length > 0)}
							onClick={() => {
								form.submit();
							}}
							type="primary"
							htmlType="submit"
						>
							Save Changes
						</Button>
					</Space>
				</Form>
			</Content>
		</Layout>
	);
}

export const SettingsView = memo(SettingsViewComponent);

export default function SettingsRoute() {
	return <SettingsView appState={useOutletContext<AppState>()} />;
}
