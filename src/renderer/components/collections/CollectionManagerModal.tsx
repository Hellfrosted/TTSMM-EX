import { InputHTMLAttributes, ReactNode, memo, useEffect, useMemo, useState } from 'react';
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
import { writeConfig } from 'renderer/util/config-write';
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

const collectionControlFocusClassName =
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const collectionInputClassName = [
	'box-border min-h-control w-full rounded-md border border-border bg-surface-elevated px-[11px] text-text outline-none',
	'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted',
	collectionControlFocusClassName
].join(' ');

function CollectionTextInput(props: InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} className={[collectionInputClassName, props.className].filter(Boolean).join(' ')} />;
}

function CollectionNativeModal({
	children,
	footer,
	onCancel,
	title,
	variant = 'default',
	width = 520,
	wrapClassName
}: CollectionNativeModalProps) {
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

	const overlayClassName = [
		'fixed inset-0 z-[1000] flex items-center justify-center bg-[color-mix(in_srgb,var(--app-color-background)_72%,transparent)] p-6',
		wrapClassName
	]
		.filter(Boolean)
		.join(' ');
	const modalClassName = [
		'flex max-h-[calc(100vh-48px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-md border border-border bg-surface-elevated shadow-[0_16px_36px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)]'
	]
		.filter(Boolean)
		.join(' ');
	const bodyClassName = [
		'overflow-auto p-4',
		variant === 'validation' ? 'max-h-[calc(100vh-224px)]' : undefined,
		variant === 'settings' ? 'pb-3 pt-2.5' : undefined
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div
			className={overlayClassName}
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
				className={modalClassName}
				role="dialog"
				style={{ width: `min(${width}px, 100%)` }}
			>
				<header className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-3.5">
					<h2 id="collection-native-modal-title" className="m-0 text-[1.05rem] font-bold leading-[1.3] text-text">
						{title}
					</h2>
					<button
						className={[
							'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-muted',
							'hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] hover:text-text',
							collectionControlFocusClassName
						].join(' ')}
						type="button"
						aria-label="Close modal"
						onClick={onCancel}
					>
						<X size={18} aria-hidden="true" />
					</button>
				</header>
				<div className={bodyClassName}>{children}</div>
				{footer ? (
					<footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border px-4 py-3.5">{footer}</footer>
				) : null}
			</section>
		</div>
	);
}

function CollectionModalButton({ children, danger, disabled, loading, onClick, variant = 'default' }: CollectionModalButtonProps) {
	const buttonClassName = [
		'inline-flex min-h-control cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface-elevated px-3.5 font-[650] text-text',
		'enabled:hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)]',
		'disabled:cursor-not-allowed disabled:opacity-55',
		variant === 'primary' ? 'border-primary bg-primary enabled:hover:border-primary-hover enabled:hover:bg-primary-hover' : undefined,
		danger
			? 'border-error bg-error enabled:hover:bg-[color-mix(in_srgb,var(--app-color-error)_86%,var(--app-color-surface-alt))]'
			: undefined,
		collectionControlFocusClassName
	]
		.filter(Boolean)
		.join(' ');

	return (
		<button className={buttonClassName} disabled={disabled || loading} onClick={onClick} type="button">
			{loading ? (
				<span
					className="h-3.5 w-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-[color-mix(in_srgb,currentColor_35%,transparent)] border-t-current"
					aria-hidden="true"
				/>
			) : null}
			{children}
		</button>
	);
}

function CollectionSwitch({ checked, disabled, onChange, ...props }: CollectionSwitchProps) {
	return (
		<input
			{...props}
			className={[
				'relative m-0 h-6 w-11 cursor-pointer appearance-none rounded-full border border-border bg-surface-elevated transition-[background-color,border-color] duration-[140ms] ease-in-out',
				"after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-text-muted after:transition-[transform,background-color] after:duration-150 after:ease-in-out after:content-['']",
				'checked:border-[color-mix(in_srgb,var(--app-color-primary)_62%,var(--app-color-border))] checked:bg-[color-mix(in_srgb,var(--app-color-primary)_28%,var(--app-color-surface-elevated))] checked:after:translate-x-5 checked:after:bg-primary',
				'disabled:cursor-not-allowed disabled:opacity-55',
				collectionControlFocusClassName
			].join(' ')}
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
			className={collectionInputClassName}
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
			await writeConfig(nextConfig);
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
					variant="validation"
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
					variant="validation"
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
					variant="settings"
					wrapClassName="px-3 pb-3 pt-[68px]"
					title="Collection table settings"
					width={760}
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
					<form className="grid w-fit max-w-full gap-3">
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
									onChange={(checked: boolean) => {
										tableSettingsForm.setValue('smallRows', checked, { shouldDirty: true, shouldValidate: true });
									}}
								/>
							</div>
						</div>
						<div className="grid w-full grid-cols-[repeat(2,minmax(280px,1fr))] gap-x-5 pb-0.5 max-[760px]:hidden" aria-hidden>
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
						<div className="grid w-full grid-cols-[repeat(2,minmax(280px,1fr))] gap-x-5 gap-y-2 max-[760px]:grid-cols-1">
							{Object.values(MainColumnTitles).map((id: string) => {
								const columnActiveConfig = mainConfigDraft.columnActiveConfig || {};
								const isChecked = columnActiveConfig[id] === undefined ? true : columnActiveConfig[id];
								const cannotDisable =
									isChecked &&
									((id === MainColumnTitles.ID && columnActiveConfig[MainColumnTitles.NAME] === false) ||
										(id === MainColumnTitles.NAME && columnActiveConfig[MainColumnTitles.ID] === false));
								const minimumWidth = getMainColumnMinWidth(id as MainColumnTitles);

								return (
									<div
										className="grid grid-cols-[minmax(0,1fr)_auto_minmax(136px,152px)] items-center gap-2 py-1 max-[520px]:grid-cols-[minmax(0,1fr)_auto] max-[520px]:gap-y-1"
										key={id}
									>
										<div className="flex min-w-0 flex-col gap-0.5">
											<strong>{id}</strong>
											{cannotDisable ? <span className="text-xs leading-[1.35]">Name or ID must stay visible.</span> : null}
										</div>
										<div className="flex min-h-11 w-[52px] items-center justify-start">
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
										<div className="w-full max-[520px]:col-span-2">
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
						<div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 max-[620px]:grid-cols-1">
							<div className="h-full rounded-md border border-border bg-surface-alt px-[18px] py-4">
								<label className="flex flex-col gap-2" htmlFor="collection-override-id">
									<span className="font-[650] text-text">Override ID</span>
									<CollectionTextInput id="collection-override-id" {...overrideForm.register('overrideId')} />
								</label>
							</div>
							<div className="h-full rounded-md border border-border bg-surface-alt px-[18px] py-4">
								<label className="flex flex-col gap-2" htmlFor="collection-current-user-tags">
									<span className="font-[650] text-text">Current User Tags</span>
									<CollectionTextInput id="collection-current-user-tags" disabled value={nextRecord.overrides?.tags?.join(', ') || ''} />
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
