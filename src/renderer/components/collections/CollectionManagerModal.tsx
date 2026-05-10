import { ReactNode, memo, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { X } from 'lucide-react';
import {
	AppConfig,
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
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import {
	createMainTableSettingsFormValues,
	mainCollectionTableSettingsSchema,
	modOverrideFormSchema,
	setMainTableSettingsColumnWidth,
	toMainCollectionConfig,
	type MainCollectionTableSettingsFormValues,
	type ModOverrideFormValues
} from 'renderer/collection-manager-form-validation';

const VALIDATION_ISSUES_HEADING_ID = 'collection-validation-issues-heading';
const DEFAULT_MAIN_CONFIG: MainCollectionConfig = {};

interface CollectionManagerModalProps {
	appState: CollectionWorkspaceAppState;
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

interface CollectionNativeModalProps {
	children: ReactNode;
	className?: string;
	footer?: ReactNode;
	onCancel: () => void;
	title: string;
	width?: number;
	wrapClassName?: string;
}

interface CollectionModalButtonProps {
	children: ReactNode;
	danger?: boolean;
	disabled?: boolean;
	loading?: boolean;
	onClick: () => void;
	variant?: 'default' | 'primary';
}

interface CollectionSwitchProps {
	'aria-label': string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}

interface CollectionNumberInputProps {
	'aria-label': string;
	min: number;
	onChange: (value?: number) => void;
	placeholder: string;
	step: number;
	value?: number;
}

function CollectionNativeModal({ children, className, footer, onCancel, title, width = 520, wrapClassName }: CollectionNativeModalProps) {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onCancel();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [onCancel]);

	return (
		<div
			className={`CollectionNativeModalOverlay${wrapClassName ? ` ${wrapClassName}` : ''}`}
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					onCancel();
				}
			}}
		>
			<section
				aria-labelledby="collection-native-modal-title"
				aria-modal="true"
				className={`CollectionNativeModal${className ? ` ${className}` : ''}`}
				role="dialog"
				style={{ width: `min(${width}px, 100%)` }}
			>
				<header className="CollectionNativeModal__header">
					<h2 id="collection-native-modal-title" className="CollectionNativeModal__title">
						{title}
					</h2>
					<button className="CollectionNativeModal__close" type="button" aria-label="Close modal" onClick={onCancel}>
						<X size={18} aria-hidden="true" />
					</button>
				</header>
				<div className="CollectionNativeModal__body">{children}</div>
				{footer ? <footer className="CollectionNativeModal__footer">{footer}</footer> : null}
			</section>
		</div>
	);
}

function CollectionModalButton({ children, danger, disabled, loading, onClick, variant = 'default' }: CollectionModalButtonProps) {
	return (
		<button
			className={`CollectionNativeModalButton${variant === 'primary' ? ' CollectionNativeModalButton--primary' : ''}${danger ? ' CollectionNativeModalButton--danger' : ''}`}
			disabled={disabled || loading}
			onClick={onClick}
			type="button"
		>
			{loading ? <span className="CollectionNativeModalButton__spinner" aria-hidden="true" /> : null}
			{children}
		</button>
	);
}

function CollectionSwitch({ checked, disabled, onChange, ...props }: CollectionSwitchProps) {
	return (
		<input
			{...props}
			className="CollectionNativeSwitch"
			checked={checked}
			disabled={disabled}
			onChange={(event) => {
				onChange(event.target.checked);
			}}
			role="switch"
			type="checkbox"
		/>
	);
}

function CollectionNumberInput({ min, onChange, placeholder, step, value, ...props }: CollectionNumberInputProps) {
	return (
		<input
			{...props}
			className="CollectionNativeNumberInput"
			min={min}
			onChange={(event) => {
				const nextValue = event.target.valueAsNumber;
				onChange(Number.isFinite(nextValue) ? nextValue : undefined);
			}}
			placeholder={placeholder}
			step={step}
			type="number"
			value={value ?? ''}
		/>
	);
}

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
	const tableSettingsForm = useForm<MainCollectionTableSettingsFormValues>({
		defaultValues: createMainTableSettingsFormValues(DEFAULT_MAIN_CONFIG),
		mode: 'onChange',
		resolver: zodResolver(mainCollectionTableSettingsSchema)
	});
	const overrideForm = useForm<ModOverrideFormValues>({
		defaultValues: { overrideId: '' },
		mode: 'onSubmit',
		resolver: zodResolver(modOverrideFormSchema)
	});
	const mainConfigDraft = useWatch({ control: tableSettingsForm.control }) as MainCollectionTableSettingsFormValues;
	const activeCollectionName = appState.activeCollection?.name || 'this collection';

	useEffect(() => {
		if (modalType === CollectionManagerModalType.VIEW_SETTINGS) {
			tableSettingsForm.reset(createMainTableSettingsFormValues(appState.config.viewConfigs.main));
		}
		if (modalType === CollectionManagerModalType.EDIT_OVERRIDES) {
			overrideForm.reset({ overrideId: currentRecord?.overrides?.id || '' });
		}
	}, [appState.config.viewConfigs.main, currentRecord, modalType, overrideForm, tableSettingsForm]);

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
					issues.push(
						`Missing dependencies: ${modErrors.missingDependencies.map((descriptor) => getModDescriptorDisplayName(descriptor)).join(', ')}`
					);
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
			<section className="CollectionValidationIssueSection" aria-labelledby={VALIDATION_ISSUES_HEADING_ID}>
				<h3 id={VALIDATION_ISSUES_HEADING_ID} className="CollectionValidationIssueHeading">
					Mods to review
				</h3>
				<div className="CollectionValidationIssueScroller">
					<ul className="CollectionValidationIssueList">
						{validationIssueSummaries.map((summary) => (
							<li key={summary.uid} className="CollectionValidationIssueItem">
								<strong className="CollectionValidationIssueItem__title">{summary.label}</strong>
								<span className="CollectionValidationIssueItem__uid">{summary.uid}</span>
								<ul className="CollectionValidationIssueDetails">
									{summary.issues.map((issue) => (
										<li key={`${summary.uid}-${issue}`}>{issue}</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				</div>
			</section>
		);
	};

	const getModManagerUID = () => {
		return `${ModType.WORKSHOP}:${appState.config.workshopID}`;
	};

	const setDraftColumnWidth = (columnId: MainColumnTitles, width?: number | null) => {
		tableSettingsForm.reset(setMainTableSettingsColumnWidth(tableSettingsForm.getValues(), columnId, width), { keepDefaultValues: true });
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
				<CollectionNativeModal
					key="warning-modal"
					title={`Delete "${activeCollectionName}"?`}
					onCancel={closeModal}
					footer={
						<>
							<CollectionModalButton variant="primary" disabled={launchGameWithErrors} onClick={closeModal}>
								Keep Collection
							</CollectionModalButton>
							<CollectionModalButton
								danger
								variant="primary"
								disabled={launchGameWithErrors}
								loading={launchGameWithErrors}
								onClick={() => {
									deleteCollection();
									closeModal();
								}}
							>
								Delete Collection
							</CollectionModalButton>
						</>
					}
				>
					<p>Delete the saved collection from TTSMM-EX.</p>
					<p>Your installed mods and Steam subscriptions will stay unchanged.</p>
					<p>This cannot be undone.</p>
				</CollectionNativeModal>
			);
		case CollectionManagerModalType.DESELECTING_MOD_MANAGER: {
			const managerUID = getModManagerUID();
			const managerData: ModData = getByUID(appState.mods, managerUID)!;
			return (
				<CollectionNativeModal
					key="manager-warning-modal"
					title="Mod manager must stay enabled"
					onCancel={closeModal}
					footer={
						<CollectionModalButton variant="primary" onClick={closeModal}>
							OK
						</CollectionModalButton>
					}
				>
					<p>TTSMM-EX needs one mod manager package enabled so TerraTech can load managed mods reliably.</p>
					<p>Your current manager is {`${managerData.name} (${appState.config.workshopID})`}.</p>
					<p>To switch managers, update the workshop item ID in Settings instead of disabling the current one here.</p>
				</CollectionNativeModal>
			);
		}
		case CollectionManagerModalType.ERRORS_FOUND:
			return (
				<CollectionNativeModal
					key="error-modal"
					className="CollectionValidationModal"
					title="Collection has blocking issues"
					width={760}
					onCancel={() => {
						appState.updateState({ launchingGame: false });
						closeModal();
					}}
					footer={
						<>
							<CollectionModalButton
								variant="primary"
								disabled={launchGameWithErrors}
								onClick={() => {
									appState.updateState({ launchingGame: false });
									closeModal();
								}}
							>
								Review Issues
							</CollectionModalButton>
							<CollectionModalButton
								danger
								variant="primary"
								disabled={launchGameWithErrors}
								loading={launchGameWithErrors}
								onClick={launchAnyway}
							>
								Launch With Blocking Issues
							</CollectionModalButton>
						</>
					}
				>
					<p>One or more enabled mods are missing required dependencies or conflict with another selected mod.</p>
					<p>Launching with this collection can cause missing content, startup failures, or save corruption.</p>
					<p>Mods that share the same Mod ID are incompatible. TerraTech only loads the first one it finds and ignores the rest.</p>
					{renderValidationIssueList()}
					<p>Review the list above before deciding whether to launch anyway.</p>
				</CollectionNativeModal>
			);
		case CollectionManagerModalType.WARNINGS_FOUND:
			return (
				<CollectionNativeModal
					key="warning-modal"
					className="CollectionValidationModal"
					title="Collection has warnings"
					width={760}
					onCancel={() => {
						appState.updateState({ launchingGame: false });
						closeModal();
					}}
					footer={
						<>
							<CollectionModalButton
								variant="primary"
								disabled={launchGameWithErrors}
								onClick={() => {
									appState.updateState({ launchingGame: false });
									closeModal();
								}}
							>
								Review Issues
							</CollectionModalButton>
							<CollectionModalButton
								danger
								variant="primary"
								disabled={launchGameWithErrors}
								loading={launchGameWithErrors}
								onClick={launchAnyway}
							>
								Launch With Warnings
							</CollectionModalButton>
						</>
					}
				>
					<p>Some mods could not be fully validated.</p>
					<p>This usually means the item is not subscribed, not installed yet, or still downloading from Steam.</p>
					{renderValidationIssueList()}
					<p>You can launch now, but review the affected mods first if the collection should be stable.</p>
				</CollectionNativeModal>
			);
		case CollectionManagerModalType.VIEW_SETTINGS: {
			if (currentView !== CollectionViewType.MAIN) {
				return null;
			}
			const submitTableSettings = tableSettingsForm.handleSubmit((values) => {
				const nextConfig = cloneAppConfig(appState.config);
				nextConfig.viewConfigs.main = toMainCollectionConfig(values, appState.config.viewConfigs.main);
				void saveConfig(nextConfig, closeModal);
			});

			return (
				<CollectionNativeModal
					key="settings-modal"
					className="CollectionSettingsModal"
					wrapClassName="CollectionSettingsModalWrap"
					title="Collection table settings"
					width={760}
					onCancel={closeModal}
					footer={
						<>
							<CollectionModalButton disabled={savingConfig} onClick={closeModal}>
								Cancel
							</CollectionModalButton>
							<CollectionModalButton
								loading={savingConfig}
								disabled={savingConfig}
								variant="primary"
								onClick={submitTableSettings}
							>
								Save Table Settings
							</CollectionModalButton>
						</>
					}
				>
					<form className="CollectionSettingsForm CollectionSettingsForm--dense">
						<div className="CollectionSettingsTopBar">
							<div className="CollectionSettingsTopCopy">
								<h3 className="CollectionSettingsSubheading">Table layout</h3>
							</div>
							<div className="CollectionSettingsToggleCard">
								<div className="CollectionSettingsToggleCopy">
									<strong>Compact rows</strong>
								</div>
								<CollectionSwitch
									aria-label="Use extra-compact rows in the main collection table"
									checked={!!mainConfigDraft.smallRows}
									onChange={(checked: boolean) => {
										tableSettingsForm.setValue('smallRows', checked, { shouldDirty: true, shouldValidate: true });
									}}
								/>
							</div>
						</div>
						<div className="CollectionSettingsColumnsHeader" aria-hidden>
							{[0, 1].map((columnGroupIndex) => (
								<div className="CollectionSettingsColumnsHeaderGroup" key={columnGroupIndex}>
									<span>Column</span>
									<span>Show</span>
									<span>Saved width</span>
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
											<strong>{id}</strong>
											{cannotDisable ? <span className="CollectionSettingsColumnHint">Name or ID must stay visible.</span> : null}
										</div>
										<div className="CollectionSettingsColumnSwitch">
											<CollectionSwitch
												aria-label={`Show ${id} column`}
												checked={isChecked}
												disabled={cannotDisable}
												onChange={(checked: boolean) => {
													tableSettingsForm.setValue(`columnActiveConfig.${id}`, checked, {
														shouldDirty: true,
														shouldValidate: true
													});
												}}
											/>
										</div>
										<div className="CollectionSettingsColumnWidth">
											<CollectionNumberInput
												aria-label={`Saved width for ${id} column`}
												min={minimumWidth}
												step={16}
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
					</form>
				</CollectionNativeModal>
			);
		}
		case CollectionManagerModalType.EDIT_OVERRIDES: {
			const nextRecord = currentRecord;
			if (!nextRecord) {
				return null;
			}
			const submitOverrideSettings = overrideForm.handleSubmit((values) => {
				const nextConfig = cloneAppConfig(appState.config);
				const nextOverride = nextConfig.userOverrides.get(nextRecord.uid) || {};
				const nextOverrideId = values.overrideId.trim();
				if (nextOverrideId) {
					nextOverride.id = nextOverrideId;
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
			});

			return (
				<CollectionNativeModal
					key="manager-override-modal"
					className="CollectionOverrideModal"
					title={`Edit Overrides For ${nextRecord.name}`}
					width={620}
					onCancel={closeModal}
					footer={
						<>
							<CollectionModalButton disabled={savingConfig} onClick={closeModal}>
								Cancel
							</CollectionModalButton>
							<CollectionModalButton
								loading={savingConfig}
								disabled={savingConfig}
								variant="primary"
								onClick={submitOverrideSettings}
							>
								Save Settings
							</CollectionModalButton>
						</>
					}
				>
					<form className="ModOverrideForm">
						<p className="CollectionModalIntro">
							Override the mod ID when you need this entry to satisfy a specific dependency target without changing the original mod
							metadata.
						</p>
						<div className="ModOverrides">
							<div className="ModOverridesPane">
								<label className="CollectionNativeField">
									<span className="CollectionNativeField__label">Override ID</span>
									<input
										className="CollectionNativeInput"
										{...overrideForm.register('overrideId')}
									/>
								</label>
							</div>
							<div className="ModOverridesPane">
								<label className="CollectionNativeField">
									<span className="CollectionNativeField__label">Current User Tags</span>
									<input className="CollectionNativeInput" disabled value={nextRecord.overrides?.tags?.join(', ') || ''} />
								</label>
							</div>
						</div>
					</form>
				</CollectionNativeModal>
			);
		}
		default:
			return null;
	}
}

export default memo(CollectionManagerModal);
