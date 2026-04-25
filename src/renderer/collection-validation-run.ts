import {
	CollectionManagerModalType,
	ModErrorType,
	cloneSessionMods,
	getModDescriptorKey,
	getRows,
	setupDescriptors,
	type AppConfig,
	type CollectionErrors,
	type DisplayModData,
	type ModCollection,
	type ModErrors,
	type SessionMods
} from 'model';

export interface ValidationIssueSummary {
	affectedMods: number;
	missingDependencies: number;
	incompatibleMods: number;
	invalidIds: number;
	subscriptionIssues: number;
	installIssues: number;
	updateIssues: number;
}

interface RenderValidationErrorsResult {
	errors?: CollectionErrors;
	mods: SessionMods;
	modalType?: CollectionManagerModalType;
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
				.map(([uid, ignoredIds]) => [uid, [...ignoredIds].sort()])
		])
		.sort(([leftType], [rightType]) => Number(leftType) - Number(rightType));
	const userOverrides = [...config.userOverrides.entries()]
		.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
		.map(([uid, override]) => [
			uid,
			{
				id: override.id ?? null,
				tags: override.tags ? [...override.tags].sort() : []
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

	return `${[...collection.mods].sort().join('\u0000')}\u0001${getValidationConfigKey(config)}`;
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

function emptySummary(): ValidationIssueSummary {
	return summarizeValidationIssues({});
}

export function renderValidationErrors(
	mods: SessionMods,
	errors: CollectionErrors,
	config: AppConfig,
	launchIfValid: boolean
): RenderValidationErrorsResult {
	const nextMods = cloneSessionMods(mods);
	setupDescriptors(nextMods, config.userOverrides);
	const rows = getRows(nextMods);
	const nextErrors = cloneCollectionErrors(errors);

	if (Object.keys(nextErrors).length === 0) {
		rows.forEach((mod: DisplayModData) => {
			mod.errors = undefined;
		});
		return {
			mods: nextMods,
			success: true,
			summary: emptySummary()
		};
	}

	let incompatibleModsFound = false;
	let invalidIdsFound = false;
	let missingSubscriptions = false;
	let missingDependenciesFound = false;
	let nonIgnoredFailed = false;

	const incompatibleIgnoredErrors = config.ignoredValidationErrors.get(ModErrorType.INCOMPATIBLE_MODS);
	const invalidIgnoredErrors = config.ignoredValidationErrors.get(ModErrorType.INVALID_ID);
	const dependencyIgnoredErrors = config.ignoredValidationErrors.get(ModErrorType.MISSING_DEPENDENCIES);

	rows.forEach((mod: DisplayModData) => {
		const thisModErrors = nextErrors[mod.uid];
		if (!thisModErrors) {
			mod.errors = undefined;
			return;
		}

		if (incompatibleIgnoredErrors?.[mod.uid] && thisModErrors.incompatibleMods) {
			const nonIgnoredErrors = thisModErrors.incompatibleMods.filter((uid) => !incompatibleIgnoredErrors[mod.uid].includes(uid));
			thisModErrors.incompatibleMods = nonIgnoredErrors.length > 0 ? nonIgnoredErrors : undefined;
		}
		incompatibleModsFound ||= !!thisModErrors.incompatibleMods?.length;

		if (invalidIgnoredErrors?.[mod.uid] && thisModErrors.invalidId) {
			thisModErrors.invalidId = invalidIgnoredErrors[mod.uid].length > 0;
		}
		invalidIdsFound ||= !!thisModErrors.invalidId;

		missingSubscriptions ||= !!thisModErrors.notSubscribed;

		if (dependencyIgnoredErrors?.[mod.uid] && thisModErrors.missingDependencies) {
			const nonIgnoredErrors = thisModErrors.missingDependencies.filter((descriptor) => {
				const descriptorKey = getModDescriptorKey(descriptor);
				return !descriptorKey || !dependencyIgnoredErrors[mod.uid].includes(descriptorKey);
			});
			thisModErrors.missingDependencies = nonIgnoredErrors.length > 0 ? nonIgnoredErrors : undefined;
		}
		missingDependenciesFound ||= !!thisModErrors.missingDependencies?.length;
		mod.errors = thisModErrors;

		nonIgnoredFailed ||= !!thisModErrors.needsUpdate || !!thisModErrors.notInstalled;
	});

	nonIgnoredFailed ||= invalidIdsFound || incompatibleModsFound || missingDependenciesFound || missingSubscriptions;
	const modalType =
		launchIfValid && nonIgnoredFailed
			? invalidIdsFound || incompatibleModsFound || missingDependenciesFound
				? CollectionManagerModalType.ERRORS_FOUND
				: CollectionManagerModalType.WARNINGS_FOUND
			: undefined;

	return {
		errors: nextErrors,
		mods: nextMods,
		modalType,
		success: !nonIgnoredFailed,
		summary: summarizeValidationIssues(nextErrors)
	};
}
