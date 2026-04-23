import { useCallback, useEffect, useRef, useState } from 'react';
import {
	CollectionErrors,
	CollectionManagerModalType,
	ModCollection,
	ModData,
	ModErrorType,
	DisplayModData,
	cloneSessionMods,
	getByUID,
	getModDescriptorKey,
	getRows,
	setupDescriptors,
	validateCollection,
	type AppState,
	type NotificationProps
} from 'model';
import api from 'renderer/Api';
import { cancellablePromise, type CancellablePromise } from 'util/Promise';
import type { NotificationType } from './useNotifications';

interface UseCollectionValidationOptions {
	appState: AppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	setModalType: (modalType: CollectionManagerModalType) => void;
	persistCollection: (collection: ModCollection) => Promise<boolean>;
	launchMods: (mods: ModData[]) => Promise<void>;
}

interface ValidationOptions {
	config?: AppState['config'];
}

function getValidationConfigKey(config: AppState['config']) {
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

function getCollectionValidationKey(collection: ModCollection | undefined, config: AppState['config']) {
	if (!collection) {
		return undefined;
	}

	return `${[...collection.mods].sort().join('\u0000')}\u0001${getValidationConfigKey(config)}`;
}

export function useCollectionValidation({
	appState,
	setModalType,
	persistCollection,
	launchMods
}: UseCollectionValidationOptions) {
	const [validatingMods, setValidatingMods] = useState(false);
	const [collectionErrors, setCollectionErrors] = useState<CollectionErrors>();
	const [lastValidationStatus, setLastValidationStatus] = useState<boolean>();
	const [lastValidatedCollectionKey, setLastValidatedCollectionKey] = useState<string>();
	const validationPromiseRef = useRef<CancellablePromise<CollectionErrors> | undefined>(undefined);

	useEffect(() => {
		return () => {
			validationPromiseRef.current?.cancel();
		};
	}, []);

	const cancelValidation = useCallback(() => {
		validationPromiseRef.current?.cancel();
		validationPromiseRef.current = undefined;
	}, []);

	const logValidationIssues = useCallback((errors: CollectionErrors) => {
		const affectedMods = Object.keys(errors).length;
		if (affectedMods === 0) {
			return;
		}

		let missingDependencies = 0;
		let incompatibleMods = 0;
		let invalidIds = 0;
		let subscriptionIssues = 0;
		let installIssues = 0;
		let updateIssues = 0;

		Object.values(errors).forEach((modErrors) => {
			if (modErrors.missingDependencies?.length) {
				missingDependencies += 1;
			}
			if (modErrors.incompatibleMods?.length) {
				incompatibleMods += 1;
			}
			if (modErrors.invalidId) {
				invalidIds += 1;
			}
			if (modErrors.notSubscribed) {
				subscriptionIssues += 1;
			}
			if (modErrors.notInstalled) {
				installIssues += 1;
			}
			if (modErrors.needsUpdate) {
				updateIssues += 1;
			}
		});

		api.logger.warn(
			[
				`Active collection has validation issues for ${affectedMods} mod${affectedMods === 1 ? '' : 's'}.`,
				`missingDependencies=${missingDependencies}`,
				`incompatibleMods=${incompatibleMods}`,
				`invalidIds=${invalidIds}`,
				`notSubscribed=${subscriptionIssues}`,
				`notInstalled=${installIssues}`,
				`needsUpdate=${updateIssues}`
			].join(' ')
		);
	}, []);

	const clearRenderedModErrors = useCallback((configOverride?: AppState['config']) => {
		const nextMods = cloneSessionMods(appState.mods);
		const validationConfig = configOverride ?? appState.config;
		setupDescriptors(nextMods, validationConfig.userOverrides);
		getRows(nextMods).forEach((mod: DisplayModData) => {
			mod.errors = undefined;
		});
		appState.updateState({ mods: nextMods });
	}, [appState]);

	const resetValidationState = useCallback((options?: ValidationOptions) => {
		cancelValidation();
		setValidatingMods(false);
		setCollectionErrors(undefined);
		setLastValidationStatus(undefined);
		setLastValidatedCollectionKey(undefined);
		clearRenderedModErrors(options?.config);
	}, [cancelValidation, clearRenderedModErrors]);

	const setModErrors = useCallback((nextCollectionErrors: CollectionErrors, launchIfValid: boolean, configOverride?: AppState['config']) => {
		const {
			mods
		} = appState;
		const validationConfig = configOverride ?? appState.config;
		const { ignoredValidationErrors } = validationConfig;
		const nextMods = cloneSessionMods(mods);
		setupDescriptors(nextMods, validationConfig.userOverrides);
		const rows = getRows(nextMods);

		if (Object.keys(nextCollectionErrors).length > 0) {
			let incompatibleModsFound = false;
			let invalidIdsFound = false;
			let missingSubscriptions = false;
			let missingDependenciesFound = false;

			const incompatibleIgnoredErrors = ignoredValidationErrors.get(ModErrorType.INCOMPATIBLE_MODS);
			const invalidIgnoredErrors = ignoredValidationErrors.get(ModErrorType.INVALID_ID);
			const dependencyIgnoredErrors = ignoredValidationErrors.get(ModErrorType.MISSING_DEPENDENCIES);

			let nonIgnoredFailed = false;

			rows.forEach((mod: DisplayModData) => {
				const thisModErrors = nextCollectionErrors[mod.uid];
				if (!thisModErrors) {
					mod.errors = undefined;
					return;
				}

				if (incompatibleIgnoredErrors?.[mod.uid] && thisModErrors.incompatibleMods) {
					const nonIgnoredErrors = thisModErrors.incompatibleMods.filter(
						(uid) => !incompatibleIgnoredErrors[mod.uid].includes(uid)
					);
					thisModErrors.incompatibleMods = nonIgnoredErrors.length > 0 ? nonIgnoredErrors : undefined;
				}
				incompatibleModsFound ||= !!thisModErrors.incompatibleMods?.length;

				if (invalidIgnoredErrors?.[mod.uid] && thisModErrors.invalidId) {
					thisModErrors.invalidId = invalidIgnoredErrors[mod.uid].length > 0;
				}
				invalidIdsFound ||= !!thisModErrors.invalidId;

				missingSubscriptions ||= !!thisModErrors.notSubscribed;

				if (dependencyIgnoredErrors?.[mod.uid] && thisModErrors.missingDependencies) {
					const nonIgnoredErrors = thisModErrors.missingDependencies.filter(
						(descriptor) => {
							const descriptorKey = getModDescriptorKey(descriptor);
							return !descriptorKey || !dependencyIgnoredErrors[mod.uid].includes(descriptorKey);
						}
					);
					thisModErrors.missingDependencies = nonIgnoredErrors.length > 0 ? nonIgnoredErrors : undefined;
				}
				missingDependenciesFound ||= !!thisModErrors.missingDependencies?.length;
				mod.errors = thisModErrors;

				nonIgnoredFailed ||= !!thisModErrors.needsUpdate || !!thisModErrors.notInstalled;
			});

			appState.updateState({ mods: nextMods });
			setCollectionErrors(nextCollectionErrors);
			nonIgnoredFailed ||= invalidIdsFound || incompatibleModsFound || missingDependenciesFound || missingSubscriptions;
			if (launchIfValid && nonIgnoredFailed) {
				setModalType(
					invalidIdsFound || incompatibleModsFound || missingDependenciesFound
						? CollectionManagerModalType.ERRORS_FOUND
						: CollectionManagerModalType.WARNINGS_FOUND
				);
			}
			return !nonIgnoredFailed;
		}

		rows.forEach((mod: DisplayModData) => {
			mod.errors = undefined;
		});
		appState.updateState({ mods: nextMods });
		setCollectionErrors(undefined);
		return true;
	}, [appState, setModalType]);

	const processValidationResult = useCallback(async (errors: CollectionErrors, launchIfValid: boolean, options?: ValidationOptions) => {
		const { activeCollection, mods } = appState;
		const currentValidationKey = getCollectionValidationKey(activeCollection, options?.config ?? appState.config);

		setValidatingMods(false);
		if (!activeCollection) {
			await launchMods([]);
			return;
		}

		let success = Object.keys(errors).length === 0;
		success = setModErrors(errors, launchIfValid, options?.config) || success;

		if (!success) {
			setLastValidationStatus(false);
			setLastValidatedCollectionKey(currentValidationKey);
			logValidationIssues(errors);
			return;
		}

		const persisted = await persistCollection(activeCollection);
		if (!persisted) {
			setLastValidationStatus(undefined);
			setLastValidatedCollectionKey(undefined);
			return;
		}

		setLastValidationStatus(true);
		setLastValidatedCollectionKey(currentValidationKey);

		if (launchIfValid) {
			const modDataList = activeCollection.mods
				.map((modUID) => getByUID(mods, modUID))
				.filter((modData): modData is ModData => !!modData);
			await launchMods(modDataList);
		}
	}, [appState, launchMods, logValidationIssues, persistCollection, setModErrors]);

	const validateActiveCollection = useCallback(async (launchIfValid: boolean, options?: ValidationOptions) => {
		const { activeCollection, mods } = appState;
		setValidatingMods(true);

		if (!activeCollection) {
			await launchMods([]);
			setValidatingMods(false);
			return;
		}

		cancelValidation();
		const validationPromise = cancellablePromise(validateCollection(mods, activeCollection));
		validationPromiseRef.current = validationPromise;

		try {
			const result = await validationPromise.promise;
			await processValidationResult(result, launchIfValid, options);
		} catch (error) {
			const wrappedError = error as { cancelled?: boolean; error?: unknown };
			if (!wrappedError.cancelled) {
				api.logger.error(wrappedError.error);
				setLastValidationStatus(false);
				setLastValidatedCollectionKey(undefined);
				setValidatingMods(false);
			}
		}
	}, [appState, cancelValidation, launchMods, processValidationResult]);

	const isValidationCurrentForCollection = useCallback(
		(collection: ModCollection | undefined) => {
			const collectionValidationKey = getCollectionValidationKey(collection, appState.config);
			return collectionValidationKey !== undefined && collectionValidationKey === lastValidatedCollectionKey;
		},
		[appState.config, lastValidatedCollectionKey]
	);

	return {
		validatingMods,
		collectionErrors,
		lastValidationStatus,
		setCollectionErrors,
		cancelValidation,
		validateActiveCollection,
		resetValidationState,
		isValidationCurrentForCollection
	};
}
