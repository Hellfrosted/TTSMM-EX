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
	unknownWorkshopDependencies: number;
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

export type CollectionValidationOutcome = 'valid' | 'blocked' | 'warnings';

type IssueSummaryKey = Exclude<keyof ValidationIssueSummary, 'affectedMods'>;
interface ValidationIssueDefinition {
	severity: 'blocking' | 'warning';
	summaryKey: IssueSummaryKey;
	message: (errors: ModErrors, mods: SessionMods) => string;
	tag: CollectionStatusTag;
	tagOrder: number;
}

const validationIssueDefinitions = {
	invalidId: {
		severity: 'blocking',
		summaryKey: 'invalidIds',
		message: () => 'Invalid mod ID',
		tag: { text: 'Invalid ID', tone: 'danger', rank: 0 },
		tagOrder: 1
	},
	missingDependencies: {
		severity: 'blocking',
		summaryKey: 'missingDependencies',
		message: (errors) => `Missing dependencies: ${errors.missingDependencies!.map(getModDescriptorDisplayName).join(', ')}`,
		tag: { text: 'Missing dependencies', tone: 'warning', rank: 2 },
		tagOrder: 2
	},
	unknownWorkshopDependencies: {
		severity: 'warning',
		summaryKey: 'unknownWorkshopDependencies',
		message: () => 'Workshop dependency metadata unknown',
		tag: { text: 'Dependencies unknown', tone: 'warning', rank: 3 },
		tagOrder: 3
	},
	incompatibleMods: {
		severity: 'blocking',
		summaryKey: 'incompatibleMods',
		message: (errors, mods) => `Conflicts with: ${errors.incompatibleMods!.map((uid) => getByUID(mods, uid)?.name || uid).join(', ')}`,
		tag: { text: 'Conflicts', tone: 'danger', rank: 1 },
		tagOrder: 0
	},
	notSubscribed: {
		severity: 'warning',
		summaryKey: 'subscriptionIssues',
		message: () => 'Not subscribed',
		tag: { text: 'Not subscribed', tone: 'warning', rank: 4 },
		tagOrder: 4
	},
	notInstalled: {
		severity: 'warning',
		summaryKey: 'installIssues',
		message: () => 'Not installed',
		tag: { text: 'Not installed', tone: 'warning', rank: 5 },
		tagOrder: 5
	},
	needsUpdate: {
		severity: 'warning',
		summaryKey: 'updateIssues',
		message: () => 'Needs update',
		tag: { text: 'Needs update', tone: 'warning', rank: 6 },
		tagOrder: 6
	}
} satisfies Record<keyof ModErrors, ValidationIssueDefinition>;

const validationIssues = Object.entries(validationIssueDefinitions) as [keyof ModErrors, ValidationIssueDefinition][];

function presentIssues(errors: ModErrors) {
	return validationIssues.filter(([key]) => {
		const value = errors[key];
		return Array.isArray(value) ? value.length > 0 : !!value;
	});
}

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
		localDir: config.localDir ?? null,
		pureVanilla: config.pureVanilla ?? false,
		treatNuterraSteamBetaAsEquivalent: config.treatNuterraSteamBetaAsEquivalent,
		ignoredValidationErrors,
		userOverrides
	});
}

export function getCollectionValidationKey(collection: ModCollection | undefined, config: AppConfig) {
	if (!collection) {
		return undefined;
	}

	return `${collection.name}\u0001${Array.from(collection.mods).sort().join('\u0000')}\u0001${getValidationConfigKey(config)}`;
}

export function summarizeValidationIssues(errors: CollectionErrors): ValidationIssueSummary {
	const summary: ValidationIssueSummary = {
		affectedMods: Object.keys(errors).length,
		...(Object.fromEntries(validationIssues.map(([, issue]) => [issue.summaryKey, 0])) as Record<IssueSummaryKey, number>)
	};

	Object.values(errors).forEach((modErrors) => {
		for (const [, issue] of presentIssues(modErrors)) summary[issue.summaryKey]++;
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
			const issues = presentIssues(modErrors).map(([, issue]) => issue.message(modErrors, mods));

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
	return presentIssues(errors).length > 0;
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
			return [{ ...validationIssueDefinitions.incompatibleMods.tag }];
		}
	}

	if (!isSelected) {
		if (!record.subscribed && record.workshopID && record.workshopID > 0) {
			return [{ ...validationIssueDefinitions.notSubscribed.tag }];
		}
		if (record.subscribed && !record.installed) {
			return [{ ...validationIssueDefinitions.notInstalled.tag }];
		}
		return [];
	}

	const errors = record.errors;
	const stateTags = errors
		? presentIssues(errors)
				.filter(
					([key]) =>
						!(key === 'notInstalled' && errors.notSubscribed) && !(key === 'needsUpdate' && (errors.notSubscribed || errors.notInstalled))
				)
				.sort(([, left], [, right]) => left.tagOrder - right.tagOrder)
				.map(([, issue]) => ({ ...issue.tag }))
		: [];

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

		if (modErrors.invalidId && invalidIgnoredErrors?.[uid]?.length) {
			modErrors.invalidId = undefined;
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
		for (const [, issue] of presentIssues(modErrors)) {
			hasBlockingErrors ||= issue.severity === 'blocking';
			hasWarnings ||= issue.severity === 'warning';
		}
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
