import { useCallback, useEffect, useRef, useState } from 'react';
import {
	CollectionErrors,
	CollectionManagerModalType,
	DisplayModData,
	ModCollection,
	ModData,
	cloneSessionMods,
	getByUID,
	getRows,
	setupDescriptors,
	validateCollection,
	type NotificationProps
} from 'model';
import api from 'renderer/Api';
import {
	getCollectionValidationKey,
	renderValidationErrors,
	type ValidationIssueSummary
} from 'renderer/collection-validation-run';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { cancellablePromise, type CancellablePromise } from 'util/Promise';
import type { NotificationType } from './useNotifications';

interface UseCollectionValidationOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	setModalType: (modalType: CollectionManagerModalType) => void;
	persistCollection: (collection: ModCollection) => Promise<boolean>;
	launchMods: (mods: ModData[]) => Promise<void>;
}

interface ValidationOptions {
	config?: CollectionWorkspaceAppState['config'];
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
	const { activeCollection, config, mods, updateState } = appState;

	useEffect(() => {
		return () => {
			validationPromiseRef.current?.cancel();
		};
	}, []);

	const cancelValidation = useCallback(() => {
		validationPromiseRef.current?.cancel();
		validationPromiseRef.current = undefined;
	}, []);

	const logValidationIssues = useCallback((summary: ValidationIssueSummary) => {
		if (summary.affectedMods === 0) {
			return;
		}

		api.logger.warn(
			[
				`Active collection has validation issues for ${summary.affectedMods} mod${summary.affectedMods === 1 ? '' : 's'}.`,
				`missingDependencies=${summary.missingDependencies}`,
				`incompatibleMods=${summary.incompatibleMods}`,
				`invalidIds=${summary.invalidIds}`,
				`notSubscribed=${summary.subscriptionIssues}`,
				`notInstalled=${summary.installIssues}`,
				`needsUpdate=${summary.updateIssues}`
			].join(' ')
		);
	}, []);

	const clearRenderedModErrors = useCallback((configOverride?: CollectionWorkspaceAppState['config']) => {
		const nextMods = cloneSessionMods(mods);
		const validationConfig = configOverride ?? config;
		setupDescriptors(nextMods, validationConfig.userOverrides);
		getRows(nextMods).forEach((mod: DisplayModData) => {
			mod.errors = undefined;
		});
		updateState({ mods: nextMods });
	}, [config, mods, updateState]);

	const resetValidationState = useCallback((options?: ValidationOptions) => {
		cancelValidation();
		setValidatingMods(false);
		setCollectionErrors(undefined);
		setLastValidationStatus(undefined);
		setLastValidatedCollectionKey(undefined);
		clearRenderedModErrors(options?.config);
	}, [cancelValidation, clearRenderedModErrors]);

	const setModErrors = useCallback((nextCollectionErrors: CollectionErrors, launchIfValid: boolean, configOverride?: CollectionWorkspaceAppState['config']) => {
		const validationConfig = configOverride ?? config;
		const result = renderValidationErrors(mods, nextCollectionErrors, validationConfig, launchIfValid);
		updateState({ mods: result.mods });
		setCollectionErrors(result.errors);
		if (result.modalType) {
			setModalType(result.modalType);
		}
		return result;
	}, [config, mods, setModalType, updateState]);

	const processValidationResult = useCallback(async (errors: CollectionErrors, launchIfValid: boolean, options?: ValidationOptions) => {
		const currentValidationKey = getCollectionValidationKey(activeCollection, options?.config ?? config);

		setValidatingMods(false);
		if (!activeCollection) {
			await launchMods([]);
			return;
		}

		const renderedErrors = setModErrors(errors, launchIfValid, options?.config);
		const success = renderedErrors.success || Object.keys(errors).length === 0;

		if (!success) {
			setLastValidationStatus(false);
			setLastValidatedCollectionKey(currentValidationKey);
			logValidationIssues(renderedErrors.summary);
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
	}, [activeCollection, config, launchMods, logValidationIssues, mods, persistCollection, setModErrors]);

	const validateActiveCollection = useCallback(async (launchIfValid: boolean, options?: ValidationOptions) => {
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
	}, [activeCollection, cancelValidation, launchMods, mods, processValidationResult]);

	const isValidationCurrentForCollection = useCallback(
		(collection: ModCollection | undefined) => {
			const collectionValidationKey = getCollectionValidationKey(collection, config);
			return collectionValidationKey !== undefined && collectionValidationKey === lastValidatedCollectionKey;
		},
		[config, lastValidatedCollectionKey]
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
