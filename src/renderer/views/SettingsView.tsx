import { memo, useCallback, useEffect } from 'react';
import { AppConfigKeys, AppState, LogLevel, NLogLevel, SettingsViewModalType } from 'model';
import { Layout, Form, Input, InputNumber, Switch, Button, Space, Select, Row, Col, Divider, Modal, Tag, Typography } from 'antd';
import { useOutletContext } from 'react-router-dom';
import { CloseOutlined, EditFilled, FolderOutlined, PlusOutlined } from '@ant-design/icons';
import { createEditingConfig, useSettingsForm } from 'renderer/hooks/useSettingsForm';
import { useNotifications } from 'renderer/hooks/collections/useNotifications';
import { validateSettingsPath } from 'util/Validation';

const { Content } = Layout;
const { Search } = Input;
const { Paragraph, Title } = Typography;

interface SettingsViewProps {
	appState: AppState;
}

function SettingsViewComponent({ appState }: SettingsViewProps) {
	const [form] = Form.useForm();
	const { madeConfigEdits, savingConfig, configErrors } = appState;
	const isLinux = window.electron.platform === 'linux';
	const { openNotification } = useNotifications();
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
				if (field === AppConfigKeys.LOCAL_DIR) {
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
						: result.descriptorsRebuilt
							? 'Dependency descriptors were rebuilt using the updated settings.'
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
					closable={false}
					footer={[
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
					closable={false}
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
								style={{ width: '200px' }}
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
					<Row align="stretch" gutter={[40, 24]} className="CollectionSettings SettingsPaneGrid" style={{ marginBottom: 10 }}>
						<Col xs={24} xxl={12} key="misc-app-settings" className="SettingsPaneColumn MiscAppSettings">
							<div className="SettingsPane">
							<Form.Item
								name="localDir"
								label="Local Mods Directory"
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
													<p>The Linux build launches TerraTech through Steam, so there is no executable path to discover or browse here.</p>
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
							<Form.Item name="logsDir" label="Logs Directory">
								<Search
									disabled
									value={editingConfig.logsDir}
									enterButton={<Button aria-label="Browse for the logs directory" icon={<FolderOutlined />} />}
									onSearch={() => {
										void handleSelectPath(AppConfigKeys.LOGS_DIR, true, 'Select directory for logs');
									}}
								/>
							</Form.Item>
							<Form.Item name="closeOnLaunch" label="Close on Game Launch">
								<Switch
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
									checked={editingConfig.pureVanilla}
									onChange={(checked) => {
										setField('pureVanilla', checked);
									}}
								/>
							</Form.Item>
							<Form.Item
								name="treatNuterraSteamBetaAsEquivalent"
								label="Treat Nuterra Variants as Equivalent"
								tooltip={{
									styles: { container: { minWidth: 320 } },
									title: (
										<div>
											<p>Treat NuterraSteam and NuterraSteam (Beta) as the same dependency during validation.</p>
											<p>Turn this off only if you need strict legacy ID matching.</p>
										</div>
									)
								}}
							>
								<Switch
									checked={editingConfig.treatNuterraSteamBetaAsEquivalent !== false}
									onChange={(checked) => {
										setField('treatNuterraSteamBetaAsEquivalent', checked);
									}}
								/>
							</Form.Item>
							<Form.Item
								name="logLevel"
								label="App Logging Level"
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
									value={editingConfig.logLevel}
									onChange={(value) => {
										setField('logLevel', value);
									}}
									style={{ width: 125 }}
								>
									<Select.Option value={LogLevel.ERROR}>
										<Tag color="green">ERROR</Tag>
									</Select.Option>
									<Select.Option value={LogLevel.WARN}>
										<Tag color="lime">WARN</Tag>
									</Select.Option>
									<Select.Option value={LogLevel.INFO}>
										<Tag color="blue">INFO</Tag>
									</Select.Option>
									<Select.Option value={LogLevel.VERBOSE}>
										<Tag color="yellow">VERBOSE</Tag>
									</Select.Option>
									<Select.Option value={LogLevel.DEBUG}>
										<Tag color="orange">DEBUG</Tag>
									</Select.Option>
									<Select.Option value={LogLevel.SILLY}>
										<Tag color="red">SILLY</Tag>
									</Select.Option>
								</Select>
							</Form.Item>
							<Form.Item
								name="workshopID"
								label="Mod Manager Workshop Item ID"
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
									<InputNumber value={editingConfig.workshopID.toString()} disabled style={{ width: 175 }} />
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
						<Col xs={24} xxl={12} key="additional-commands" className="SettingsPaneColumn">
							<div className="SettingsPane">
							<Form.Item name="extraParams" label="Additional Launch Arguments">
								<Input
									value={editingConfig.extraParams}
									onChange={(event) => {
										setField('extraParams', event.target.value);
									}}
								/>
							</Form.Item>
							<Divider>TTLogManager Logger Overrides</Divider>
							{editingConfig.editingLogConfig.map((config, index) => {
								const id = ['editingLogConfig', index, 'loggerID'];

								return (
									<Form.Item
										name={id}
										key={`${config.loggerID}-${index}`}
										label={`Config ${index}`}
										rules={[
											{
												validator: async () => validateLoggerID(config.loggerID)
											}
										]}
										style={{ width: '100%' }}
									>
										<Space style={{ width: '100%' }}>
											<Select
												value={config.level}
												onChange={(value) => {
													updateLogConfig(index, { level: value as NLogLevel });
												}}
												style={{ width: 125 }}
											>
												<Select.Option value={NLogLevel.OFF}>
													<Tag>OFF</Tag>
												</Select.Option>
												<Select.Option value={NLogLevel.FATAL}>
													<Tag color="green">FATAL</Tag>
												</Select.Option>
												<Select.Option value={NLogLevel.ERROR}>
													<Tag color="lime">ERROR</Tag>
												</Select.Option>
												<Select.Option value={NLogLevel.WARN}>
													<Tag color="cyan">WARN</Tag>
												</Select.Option>
												<Select.Option value={NLogLevel.INFO}>
													<Tag color="blue">INFO</Tag>
												</Select.Option>
												<Select.Option value={NLogLevel.DEBUG}>
													<Tag color="orange">DEBUG</Tag>
												</Select.Option>
												<Select.Option value={NLogLevel.TRACE}>
													<Tag color="red">TRACE</Tag>
												</Select.Option>
											</Select>
											<Space.Compact style={{ width: '100%' }}>
												<Input style={{ width: 'calc(100% - 50px)' }} value={config.loggerID} disabled />
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
										</Space>
									</Form.Item>
								);
							})}
							<span style={{ justifyContent: 'center', display: 'flex' }}>
								<Button
									icon={<PlusOutlined />}
									onClick={() => {
										addLogConfig();
									}}
									type="primary"
								>
									Add Logger Override
								</Button>
							</span>
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
