import { InputHTMLAttributes, ReactNode, memo, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import {
	AppConfig,
	CollectionErrors,
	CollectionManagerModalType,
	CollectionViewType,
	getByUID,
	MainColumnTitles,
	MainCollectionConfig,
	ModData,
	ModType,
	NotificationProps,
	getMainColumnMinWidth
} from 'model';
import api from 'renderer/Api';
import { getValidationIssueList } from 'renderer/collection-validation-run';
import { DesktopButton, DesktopDialog, DesktopInput, DesktopSwitch } from 'renderer/components/DesktopControls';
import { cloneAppConfig } from 'renderer/hooks/collections/utils';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { persistConfigChange } from 'renderer/util/config-write';
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
type ValidationIssueSummaryList = ReturnType<typeof getValidationIssueList>;

function ValidationIssueList({ validationIssueSummaries }: { validationIssueSummaries: ValidationIssueSummaryList }) {
	if (validationIssueSummaries.length === 0) {
		return null;
	}

	return (
		<section className="mt-5" aria-labelledby={VALIDATION_ISSUES_HEADING_ID}>
			<h3 id={VALIDATION_ISSUES_HEADING_ID}>Mods to review</h3>
			<div className="pr-2">
				<ul className="m-0 grid gap-3.5 p-0">
					{validationIssueSummaries.map((summary) => (
						<li key={summary.uid} className="grid gap-1">
							<strong className="block">{summary.label}</strong>
							<span className="block">{summary.uid}</span>
							<ul className="m-0 grid gap-1 pl-5">
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
}

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

interface CollectionDialogProps {
	children: ReactNode;
	footer?: ReactNode;
	onCancel: () => void;
	title: string;
	variant?: 'default' | 'settings' | 'validation';
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

function CollectionTextInput(props: InputHTMLAttributes<HTMLInputElement>) {
	return <DesktopInput {...props} />;
}

function CollectionDialog({ children, footer, onCancel, title, variant = 'default', width = 520, wrapClassName }: CollectionDialogProps) {
	const bodyClassName = [
		variant === 'validation' ? 'max-h-[calc(100vh-224px)]' : undefined,
		variant === 'settings' ? 'pb-3 pt-2.5' : undefined
	]
		.filter(Boolean)
		.join(' ');
	const panelClassName = [
		'max-h-[calc(100vh-48px)] max-w-[calc(100vw-32px)]',
		width >= 900 ? 'w-[min(920px,calc(100vw-32px))]' : width >= 760 ? 'w-[min(760px,calc(100vw-32px))]' : undefined
	]
		.filter(Boolean)
		.join(' ');

	return (
		<DesktopDialog
			open
			title={title}
			titleClassName="text-[1.05rem] font-bold"
			closeLabel="Close modal"
			onCancel={onCancel}
			overlayClassName={wrapClassName}
			panelClassName={panelClassName}
			panelStyle={{ width: `min(${width}px, calc(100vw - 32px))` }}
			bodyClassName={bodyClassName}
			footer={footer}
		>
			<div className="w-full min-w-0">{children}</div>
		</DesktopDialog>
	);
}

function CollectionModalButton({ children, danger, disabled, loading, onClick, variant = 'default' }: CollectionModalButtonProps) {
	return (
		<DesktopButton danger={danger} disabled={disabled} loading={loading} onClick={onClick} type="button" variant={variant}>
			{children}
		</DesktopButton>
	);
}

function CollectionSwitch({ checked, disabled, onChange, ...props }: CollectionSwitchProps) {
	return (
		<DesktopSwitch
			{...props}
			className="m-0"
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
		<DesktopInput
			{...props}
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

function ValidationLaunchDialog({
	blocking,
	closeModal,
	launchAnyway,
	launchGameWithErrors,
	onReviewIssues,
	validationIssueSummaries
}: {
	blocking: boolean;
	closeModal: () => void;
	launchAnyway: () => void;
	launchGameWithErrors: boolean;
	onReviewIssues: () => void;
	validationIssueSummaries: ValidationIssueSummaryList;
}) {
	return (
		<CollectionDialog
			key={blocking ? 'error-modal' : 'warning-modal'}
			variant="validation"
			title={blocking ? 'Collection has blocking issues' : 'Collection has warnings'}
			width={760}
			onCancel={closeModal}
			footer={
				<>
					<CollectionModalButton variant="primary" disabled={launchGameWithErrors} onClick={onReviewIssues}>
						Review Issues
					</CollectionModalButton>
					<CollectionModalButton
						danger
						variant="primary"
						disabled={launchGameWithErrors}
						loading={launchGameWithErrors}
						onClick={launchAnyway}
					>
						{blocking ? 'Launch With Blocking Issues' : 'Launch With Warnings'}
					</CollectionModalButton>
				</>
			}
		>
			{blocking ? (
				<>
					<p>One or more enabled mods are missing required dependencies or conflict with another selected mod.</p>
					<p>Launching with this collection can cause missing content, startup failures, or save corruption.</p>
					<p>Mods that share the same Mod ID are incompatible. TerraTech only loads the first one it finds and ignores the rest.</p>
					<ValidationIssueList validationIssueSummaries={validationIssueSummaries} />
					<p>Review the list above before deciding whether to launch anyway.</p>
				</>
			) : (
				<>
					<p>Some mods could not be fully validated.</p>
					<p>This usually means the item is not subscribed, not installed yet, or still downloading from Steam.</p>
					<ValidationIssueList validationIssueSummaries={validationIssueSummaries} />
					<p>You can launch now, but review the affected mods first if the collection should be stable.</p>
				</>
			)}
		</CollectionDialog>
	);
}

function MainTableSettingsForm({
	mainConfigDraft,
	setColumnActive,
	setColumnWidth,
	setSmallRows
}: {
	mainConfigDraft: MainCollectionTableSettingsFormValues;
	setColumnActive: (id: MainColumnTitles, checked: boolean) => void;
	setColumnWidth: (id: MainColumnTitles, value?: number) => void;
	setSmallRows: (checked: boolean) => void;
}) {
	return (
		<form className="grid w-full max-w-full gap-3">
			<div className="grid w-full grid-cols-[1fr_auto] items-center gap-4 max-[620px]:grid-cols-1 max-[620px]:items-start">
				<div className="flex min-w-0 items-center">
					<h3 className="m-0 text-[0.95rem] font-bold text-text">Table layout</h3>
				</div>
				<div className="inline-flex min-w-0 items-center gap-2.5">
					<div className="min-w-0">
						<strong>Compact rows</strong>
					</div>
					<CollectionSwitch
						aria-label="Use extra-compact rows in the main collection table"
						checked={!!mainConfigDraft.smallRows}
						onChange={setSmallRows}
					/>
				</div>
			</div>
			<div className="grid w-full grid-cols-[repeat(2,minmax(260px,1fr))] gap-x-5 pb-0.5 max-[760px]:hidden" aria-hidden>
				{[0, 1].map((columnGroupIndex) => (
					<div
						className="[&>span]:font-[650] grid grid-cols-[minmax(0,1fr)_auto_minmax(136px,152px)] items-center gap-2 [&>span]:text-xs [&>span]:uppercase [&>span]:text-text-muted [&>span:nth-child(2)]:justify-self-start [&>span:nth-child(3)]:justify-self-start"
						key={columnGroupIndex}
					>
						<span>Column</span>
						<span>Show</span>
						<span>Saved width</span>
					</div>
				))}
			</div>
			<div className="grid w-full grid-cols-[repeat(2,minmax(260px,1fr))] gap-x-5 gap-y-2 max-[760px]:grid-cols-1">
				{Object.values(MainColumnTitles).map((id: MainColumnTitles) => {
					const columnActiveConfig = mainConfigDraft.columnActiveConfig || {};
					const isChecked = columnActiveConfig[id] === undefined ? true : columnActiveConfig[id];
					const cannotDisable =
						isChecked &&
						((id === MainColumnTitles.ID && columnActiveConfig[MainColumnTitles.NAME] === false) ||
							(id === MainColumnTitles.NAME && columnActiveConfig[MainColumnTitles.ID] === false));
					const minimumWidth = getMainColumnMinWidth(id);

					return (
						<div
							className="grid grid-cols-[minmax(0,1fr)_auto_minmax(136px,152px)] items-center gap-2 py-1 max-[520px]:grid-cols-[minmax(0,1fr)_auto] max-[520px]:gap-y-1"
							key={id}
						>
							<div className="flex min-w-0 flex-col gap-0.5">
								<strong>{id}</strong>
								{cannotDisable ? <span className="text-xs leading-[1.35]">Name or ID must stay visible.</span> : null}
							</div>
							<div className="flex min-h-11 w-13 items-center justify-start">
								<CollectionSwitch
									aria-label={`Show ${id} column`}
									checked={isChecked}
									disabled={cannotDisable}
									onChange={(checked: boolean) => {
										setColumnActive(id, checked);
									}}
								/>
							</div>
							<div className="w-full max-[520px]:col-span-2">
								<CollectionNumberInput
									aria-label={`Saved width for ${id} column`}
									min={minimumWidth}
									step={16}
									value={mainConfigDraft.columnWidthConfig?.[id]}
									placeholder={`Auto (${minimumWidth}px min)`}
									onChange={(value) => {
										setColumnWidth(id, typeof value === 'number' ? value : undefined);
									}}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</form>
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

	const validationIssueSummaries = useMemo(
		() => getValidationIssueList(collectionErrors, appState.mods),
		[appState.mods, collectionErrors]
	);

	const getModManagerUID = () => {
		return `${ModType.WORKSHOP}:${appState.config.workshopID}`;
	};

	const setDraftColumnWidth = (columnId: MainColumnTitles, width?: number | null) => {
		tableSettingsForm.reset(setMainTableSettingsColumnWidth(tableSettingsForm.getValues(), columnId, width), { keepDefaultValues: true });
	};
	const closeLaunchWarning = () => {
		appState.updateState({ launchingGame: false });
		closeModal();
	};

	const saveConfig = async (nextConfig: AppConfig, afterSave?: () => void) => {
		setSavingConfig(true);
		try {
			await persistConfigChange(nextConfig, (persistedConfig) => appState.updateState({ config: persistedConfig }));
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
				<CollectionDialog
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
				</CollectionDialog>
			);
		case CollectionManagerModalType.DESELECTING_MOD_MANAGER: {
			const managerUID = getModManagerUID();
			const managerData: ModData = getByUID(appState.mods, managerUID)!;
			return (
				<CollectionDialog
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
				</CollectionDialog>
			);
		}
		case CollectionManagerModalType.ERRORS_FOUND:
			return (
				<ValidationLaunchDialog
					blocking
					closeModal={closeLaunchWarning}
					launchAnyway={launchAnyway}
					launchGameWithErrors={launchGameWithErrors}
					onReviewIssues={closeLaunchWarning}
					validationIssueSummaries={validationIssueSummaries}
				/>
			);
		case CollectionManagerModalType.WARNINGS_FOUND:
			return (
				<ValidationLaunchDialog
					blocking={false}
					closeModal={closeLaunchWarning}
					launchAnyway={launchAnyway}
					launchGameWithErrors={launchGameWithErrors}
					onReviewIssues={closeLaunchWarning}
					validationIssueSummaries={validationIssueSummaries}
				/>
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
				<CollectionDialog
					key="settings-modal"
					variant="settings"
					wrapClassName="p-6"
					title="Collection table settings"
					width={920}
					onCancel={closeModal}
					footer={
						<>
							<CollectionModalButton disabled={savingConfig} onClick={closeModal}>
								Cancel
							</CollectionModalButton>
							<CollectionModalButton loading={savingConfig} disabled={savingConfig} variant="primary" onClick={submitTableSettings}>
								Save Table Settings
							</CollectionModalButton>
						</>
					}
				>
					<MainTableSettingsForm
						mainConfigDraft={mainConfigDraft}
						setSmallRows={(checked) => {
							tableSettingsForm.setValue('smallRows', checked, { shouldDirty: true, shouldValidate: true });
						}}
						setColumnActive={(id, checked) => {
							tableSettingsForm.setValue(`columnActiveConfig.${id}`, checked, {
								shouldDirty: true,
								shouldValidate: true
							});
						}}
						setColumnWidth={setDraftColumnWidth}
					/>
				</CollectionDialog>
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
				<CollectionDialog
					key="manager-override-modal"
					title={`Edit Overrides For ${nextRecord.name}`}
					width={620}
					onCancel={closeModal}
					footer={
						<>
							<CollectionModalButton disabled={savingConfig} onClick={closeModal}>
								Cancel
							</CollectionModalButton>
							<CollectionModalButton loading={savingConfig} disabled={savingConfig} variant="primary" onClick={submitOverrideSettings}>
								Save Settings
							</CollectionModalButton>
						</>
					}
				>
					<form className="mt-1">
						<p className="mb-4">
							Override the mod ID when you need this entry to satisfy a specific dependency target without changing the original mod
							metadata.
						</p>
						<div className="grid grid-cols-2 gap-4 max-[620px]:grid-cols-1">
							<div className="h-full rounded-sm border border-border bg-surface-alt px-4.5 py-4">
								<label className="flex flex-col gap-2" htmlFor="collection-override-id">
									<span className="font-[650] text-text">Override ID</span>
									<CollectionTextInput id="collection-override-id" {...overrideForm.register('overrideId')} />
								</label>
							</div>
							<div className="h-full rounded-sm border border-border bg-surface-alt px-4.5 py-4">
								<label className="flex flex-col gap-2" htmlFor="collection-current-user-tags">
									<span className="font-[650] text-text">Current User Tags</span>
									<CollectionTextInput id="collection-current-user-tags" disabled value={nextRecord.overrides?.tags?.join(', ') || ''} />
								</label>
							</div>
						</div>
					</form>
				</CollectionDialog>
			);
		}
		default:
			return null;
	}
}

export default memo(CollectionManagerModal);
