import type { AppConfig } from './AppConfig';
import { type CollectionErrors, type DisplayModData, type ModErrors, ModErrorType } from './CollectionValidation';
import { getModDescriptorDisplayName, getModDescriptorKey, ModType } from './Mod';
import type { ModCollection } from './ModCollection';
import { getByUID, type SessionMods } from './SessionMods';

export interface ValidationIssueSummary {
	affectedMods: number;
	missingDependencies: number;
	incompatibleMods: number;
	invalidIds: number;
	subscriptionIssues: number;
	installIssues: number;
	updateIssues: number;
}

interface ValidationIssueListItem {
	issues: string[];
	label: string;
	uid: string;
}

type CollectionStatusTagTone = 'danger' | 'neutral' | 'success' | 'warning';

export interface CollectionStatusTag {
	rank: number;
	text: string;
	tone: CollectionStatusTagTone;
}

interface CollectionStatusTagInput {
	lastValidationStatus?: boolean;
	record: DisplayModData;
	selectedMods: readonly string[] | ReadonlySet<string>;
}

type CollectionValidationOutcome = 'valid' | 'blocked' | 'warnings';

interface CollectionValidationResultPolicy {
	errors?: CollectionErrors;
	hasBlockingErrors: boolean;
	hasWarnings: boolean;
	outcome: CollectionValidationOutcome;
	success: boolean;
	summary: ValidationIssueSummary;
}

function cloneModErrors(errors: ModErrors): ModErrors {
	return {
		...errors,
		missingDependencies: errors.missingDependencies ? [...errors.missingDependencies] : undefined,
		incompatibleMods: errors.incompatibleMods ? [...errors.incompatibleMods] : undefined
	};
}

function cloneCollectionErrors(errors: CollectionErrors): CollectionErrors {
	return Object.fromEntries(Object.entries(errors).map(([uid, modErrors]) => [uid, cloneModErrors(modErrors)]));
}

function getValidationConfigKey(config: AppConfig) {
	const ignoredValidationErrors = [...config.ignoredValidationErrors.entries()]
		.map(([errorType, ignoredByUid]) => [
			errorType,
			Object.entries(ignoredByUid)
				.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
				.map(([uid, ignoredIds]) => [uid, Array.from(ignoredIds).sort()])
		])
		.sort(([leftType], [rightType]) => Number(leftType) - Number(rightType));
	const userOverrides = Array.from(config.userOverrides.entries())
		.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
		.map(([uid, override]) => [
			uid,
			{
				id: override.id ?? null,
				tags: override.tags ? Array.from(override.tags).sort() : []
			}
		]);

	return JSON.stringify({
		workshopID: config.workshopID.toString(),
		ignoredValidationErrors,
		userOverrides
	});
}

export function getCollectionValidationKey(collection: ModCollection | undefined, config: AppConfig) {
	if (!collection) {
		return undefined;
	}

	return `${Array.from(collection.mods).sort().join('\u0000')}\u0001${getValidationConfigKey(config)}`;
}

export function summarizeValidationIssues(errors: CollectionErrors): ValidationIssueSummary {
	const summary: ValidationIssueSummary = {
		affectedMods: Object.keys(errors).length,
		missingDependencies: 0,
		incompatibleMods: 0,
		invalidIds: 0,
		subscriptionIssues: 0,
		installIssues: 0,
		updateIssues: 0
	};

	Object.values(errors).forEach((modErrors) => {
		if (modErrors.missingDependencies?.length) {
			summary.missingDependencies += 1;
		}
		if (modErrors.incompatibleMods?.length) {
			summary.incompatibleMods += 1;
		}
		if (modErrors.invalidId) {
			summary.invalidIds += 1;
		}
		if (modErrors.notSubscribed) {
			summary.subscriptionIssues += 1;
		}
		if (modErrors.notInstalled) {
			summary.installIssues += 1;
		}
		if (modErrors.needsUpdate) {
			summary.updateIssues += 1;
		}
	});

	return summary;
}

export function getValidationIssueList(errors: CollectionErrors | undefined, mods: SessionMods): ValidationIssueListItem[] {
	if (!errors) {
		return [];
	}

	return Object.entries(errors)
		.flatMap(([uid, modErrors]) => {
			const modData = getByUID(mods, uid);
			const issues: string[] = [];

			if (modErrors.invalidId) {
				issues.push('Invalid mod ID');
			}
			if (modErrors.missingDependencies?.length) {
				issues.push(
					`Missing dependencies: ${modErrors.missingDependencies.map((descriptor) => getModDescriptorDisplayName(descriptor)).join(', ')}`
				);
			}
			if (modErrors.unknownWorkshopDependencies) {
				issues.push('Workshop dependency metadata unknown');
			}
			if (modErrors.incompatibleMods?.length) {
				issues.push(
					`Conflicts with: ${modErrors.incompatibleMods.map((conflictingUid) => getByUID(mods, conflictingUid)?.name || conflictingUid).join(', ')}`
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

			return issues.length > 0
				? [
						{
							uid,
							label: modData?.name || modData?.id || uid,
							issues
						}
					]
				: [];
		})
		.sort((left, right) => left.label.localeCompare(right.label));
}

function emptySummary(): ValidationIssueSummary {
	return summarizeValidationIssues({});
}

function hasModErrors(errors: ModErrors) {
	return (
		!!errors.invalidId ||
		!!errors.notSubscribed ||
		!!errors.notInstalled ||
		!!errors.needsUpdate ||
		!!errors.unknownWorkshopDependencies ||
		!!errors.missingDependencies?.length ||
		!!errors.incompatibleMods?.length
	);
}

function hasSelectedMod(selectedMods: CollectionStatusTagInput['selectedMods'], uid: string) {
	return 'has' in selectedMods ? selectedMods.has(uid) : selectedMods.includes(uid);
}

export function getCollectionStatusTags({ lastValidationStatus, record, selectedMods }: CollectionStatusTagInput): CollectionStatusTag[] {
	const isSelected = hasSelectedMod(selectedMods, record.uid);

	if (record.installed && record.id === null) {
		return [{ text: 'Invalid', tone: 'danger', rank: 0 }];
	}

	if (record.type === ModType.DESCRIPTOR) {
		const selectedChildren = record.children?.filter((child) => hasSelectedMod(selectedMods, child.uid)) ?? [];
		if (selectedChildren.length > 1) {
			return [{ text: 'Conflicts', tone: 'danger', rank: 1 }];
		}
	}

	if (!isSelected) {
		if (!record.subscribed && record.workshopID && record.workshopID > 0) {
			return [{ text: 'Not subscribed', tone: 'warning', rank: 4 }];
		}
		if (record.subscribed && !record.installed) {
			return [{ text: 'Not installed', tone: 'warning', rank: 5 }];
		}
		return [];
	}

	const stateTags: CollectionStatusTag[] = [];
	if (record.errors) {
		if (record.errors.incompatibleMods?.length) {
			stateTags.push({ text: 'Conflicts', tone: 'danger', rank: 1 });
		}
		if (record.errors.invalidId) {
			stateTags.push({ text: 'Invalid ID', tone: 'danger', rank: 0 });
		}
		if (record.errors.missingDependencies?.length) {
			stateTags.push({ text: 'Missing dependencies', tone: 'warning', rank: 2 });
		}
		if (record.errors.unknownWorkshopDependencies) {
			stateTags.push({ text: 'Dependencies unknown', tone: 'warning', rank: 3 });
		}
		if (record.errors.notSubscribed) {
			stateTags.push({ text: 'Not subscribed', tone: 'warning', rank: 4 });
		} else if (record.errors.notInstalled) {
			stateTags.push({ text: 'Not installed', tone: 'warning', rank: 5 });
		} else if (record.errors.needsUpdate) {
			stateTags.push({ text: 'Needs update', tone: 'warning', rank: 6 });
		}
	}

	if (stateTags.length > 0) {
		return stateTags;
	}

	if (lastValidationStatus !== undefined) {
		return [{ text: 'OK', tone: 'success', rank: 7 }];
	}

	return [{ text: 'Pending', tone: 'neutral', rank: 8 }];
}

function applyIgnoredValidationErrors(errors: CollectionErrors, config: AppConfig): CollectionErrors {
	const nextErrors = cloneCollectionErrors(errors);
	const incompatibleIgnoredErrors = config.ignoredValidationErrors.get(ModErrorType.INCOMPATIBLE_MODS);
	const invalidIgnoredErrors = config.ignoredValidationErrors.get(ModErrorType.INVALID_ID);
	const dependencyIgnoredErrors = config.ignoredValidationErrors.get(ModErrorType.MISSING_DEPENDENCIES);

	Object.entries(nextErrors).forEach(([uid, modErrors]) => {
		if (incompatibleIgnoredErrors?.[uid] && modErrors.incompatibleMods) {
			const nonIgnoredErrors = modErrors.incompatibleMods.filter(
				(conflictingUid) => !incompatibleIgnoredErrors[uid].includes(conflictingUid)
			);
			modErrors.incompatibleMods = nonIgnoredErrors.length > 0 ? nonIgnoredErrors : undefined;
		}

		if (invalidIgnoredErrors?.[uid] && modErrors.invalidId) {
			modErrors.invalidId = invalidIgnoredErrors[uid].length > 0;
		}

		if (dependencyIgnoredErrors?.[uid] && modErrors.missingDependencies) {
			const nonIgnoredErrors = modErrors.missingDependencies.filter((descriptor) => {
				const descriptorKey = getModDescriptorKey(descriptor);
				return !descriptorKey || !dependencyIgnoredErrors[uid].includes(descriptorKey);
			});
			modErrors.missingDependencies = nonIgnoredErrors.length > 0 ? nonIgnoredErrors : undefined;
		}

		if (!hasModErrors(modErrors)) {
			delete nextErrors[uid];
		}
	});

	return nextErrors;
}

export function createCollectionValidationResultPolicy(errors: CollectionErrors, config: AppConfig): CollectionValidationResultPolicy {
	const effectiveErrors = applyIgnoredValidationErrors(errors, config);

	if (Object.keys(effectiveErrors).length === 0) {
		return {
			hasBlockingErrors: false,
			hasWarnings: false,
			outcome: 'valid',
			success: true,
			summary: emptySummary()
		};
	}

	let hasBlockingErrors = false;
	let hasWarnings = false;

	Object.values(effectiveErrors).forEach((modErrors) => {
		hasBlockingErrors ||= !!modErrors.invalidId || !!modErrors.incompatibleMods?.length || !!modErrors.missingDependencies?.length;
		hasWarnings ||=
			!!modErrors.notSubscribed || !!modErrors.notInstalled || !!modErrors.needsUpdate || !!modErrors.unknownWorkshopDependencies;
	});

	return {
		errors: effectiveErrors,
		hasBlockingErrors,
		hasWarnings,
		outcome: hasBlockingErrors ? 'blocked' : 'warnings',
		success: false,
		summary: summarizeValidationIssues(effectiveErrors)
	};
}
