import { useCallback, useEffect, useRef, useState } from 'react';
import {
	CollectionErrors,
	CollectionManagerModalType,
	ModCollection,
	validateCollection,
	type AppConfig,
	type NotificationProps
} from 'model';
import api from 'renderer/Api';
import { renderValidationErrors, summarizeValidationIssues, type ValidationIssueSummary } from 'renderer/collection-validation-run';
import {
	createCollectionWorkspaceValidationResult,
	getCollectionValidationCompletionDecision,
	getCollectionValidationPersistenceDecision,
	type CollectionWorkspaceValidationResult
} from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { cancellablePromise, type CancellablePromise } from 'util/Promise';
import type { NotificationType } from './useNotifications';

interface UseCollectionValidationOptions {
	appState: CollectionWorkspaceAppState;
	openNotification?: (props: NotificationProps, type?: NotificationType) => void;
	setModalType?: (modalType: CollectionManagerModalType) => void;
	persistCollection: (collection: ModCollection) => Promise<boolean>;
}

interface ValidationOptions {
	config?: CollectionWorkspaceAppState['config'];
}

interface ValidationRequest {
	collection: ModCollection;
	config: AppConfig;
	mods: CollectionWorkspaceAppState['mods'];
}

export type CollectionValidationRunOutcome =
	| {
			type: 'cancelled';
	  }
	| {
			type: 'discarded-stale-result';
			validationResult?: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'missing-active-collection';
	  }
	| {
			type: 'persistence-failed';
			validationResult: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'recorded-and-ready-to-launch-current-draft';
			launchCollection: ModCollection;
			validationResult: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'recorded-current-result';
			validationResult: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'recorded-failed-result';
			modalType?: CollectionManagerModalType;
			validationResult: CollectionWorkspaceValidationResult;
	  }
	| {
			type: 'validation-run-failed';
	  };

export function useCollectionValidation({ appState, persistCollection }: UseCollectionValidationOptions) {
	const [validatingMods, setValidatingMods] = useState(false);
	const [validationResult, setValidationResult] = useState<CollectionWorkspaceValidationResult>();
	const validationPromiseRef = useRef<CancellablePromise<CollectionErrors> | undefined>(undefined);
	const { activeCollection, config, mods } = appState;
	const collectionErrors = validationResult?.errors;
	const lastValidationStatus = validationResult?.success;
	const lastValidatedCollectionKey = validationResult?.draftKey;

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

	const resetValidationState = useCallback(
		(_options?: ValidationOptions) => {
			cancelValidation();
			setValidatingMods(false);
			setValidationResult(undefined);
		},
		[cancelValidation]
	);

	const setCollectionErrors = useCallback((nextCollectionErrors: CollectionErrors | undefined) => {
		setValidationResult((currentResult) => {
			if (!currentResult) {
				return undefined;
			}
			return {
				...currentResult,
				errors: nextCollectionErrors,
				summary: nextCollectionErrors ? summarizeValidationIssues(nextCollectionErrors) : undefined
			};
		});
	}, []);

	const renderCollectionErrors = useCallback(
		(
			nextCollectionErrors: CollectionErrors,
			launchIfValid: boolean,
			configOverride?: CollectionWorkspaceAppState['config'],
			targetMods = mods
		) => {
			const validationConfig = configOverride ?? config;
			return renderValidationErrors(targetMods, nextCollectionErrors, validationConfig, launchIfValid);
		},
		[config, mods]
	);

	const processValidationResult = useCallback(
		async (errors: CollectionErrors, launchIfValid: boolean, request: ValidationRequest): Promise<CollectionValidationRunOutcome> => {
			setValidatingMods(false);

			const pendingValidationResult = createCollectionWorkspaceValidationResult({
				collection: request.collection,
				config: request.config,
				errors,
				success: Object.keys(errors).length === 0
			});
			const preRenderWorkspace = {
				activeCollection: appState.activeCollection,
				config: appState.config
			};
			const preRenderDecision = getCollectionValidationCompletionDecision({
				...preRenderWorkspace,
				validationResult: pendingValidationResult
			});
			if (preRenderDecision.action === 'discard-stale-result') {
				return {
					type: 'discarded-stale-result',
					validationResult: pendingValidationResult
				};
			}

			const renderedErrors = renderCollectionErrors(errors, launchIfValid, request.config, request.mods);
			const success = renderedErrors.success || Object.keys(errors).length === 0;
			const validationResult = createCollectionWorkspaceValidationResult({
				collection: request.collection,
				config: request.config,
				errors: renderedErrors.errors,
				success,
				summary: renderedErrors.summary
			});
			if (!validationResult) {
				return {
					type: 'discarded-stale-result'
				};
			}
			const completionDecision = getCollectionValidationCompletionDecision({
				...preRenderWorkspace,
				validationResult
			});

			if (completionDecision.action === 'discard-stale-result') {
				return {
					type: 'discarded-stale-result',
					validationResult
				};
			}

			if (completionDecision.action === 'record-failed-result') {
				setValidationResult(validationResult);
				logValidationIssues(renderedErrors.summary);
				return {
					type: 'recorded-failed-result',
					modalType: renderedErrors.modalType,
					validationResult
				};
			}

			const persisted = await persistCollection(request.collection);
			if (!persisted) {
				setValidationResult(undefined);
				return {
					type: 'persistence-failed',
					validationResult
				};
			}

			const postPersistenceWorkspace = {
				activeCollection: appState.activeCollection,
				config: appState.config,
				mods: appState.mods
			};
			const persistenceDecision = getCollectionValidationPersistenceDecision({
				activeCollection: postPersistenceWorkspace.activeCollection,
				config: postPersistenceWorkspace.config,
				launchIfValid,
				validationResult
			});
			if (persistenceDecision.action === 'discard-stale-result') {
				return {
					type: 'discarded-stale-result',
					validationResult
				};
			}

			setValidationResult(validationResult);

			if (persistenceDecision.action === 'record-and-launch-current-draft' && persistenceDecision.launchCollection) {
				return {
					type: 'recorded-and-ready-to-launch-current-draft',
					launchCollection: persistenceDecision.launchCollection,
					validationResult
				};
			}

			return {
				type: 'recorded-current-result',
				validationResult
			};
		},
		[appState, logValidationIssues, persistCollection, renderCollectionErrors]
	);

	const validateActiveCollection = useCallback(
		async (launchIfValid: boolean, options?: ValidationOptions) => {
			setValidatingMods(true);

			if (!activeCollection) {
				setValidatingMods(false);
				return {
					type: 'missing-active-collection'
				} satisfies CollectionValidationRunOutcome;
			}

			cancelValidation();
			const validationRequest = {
				collection: activeCollection,
				config: options?.config ?? appState.config,
				mods: appState.mods
			};
			const validationPromise = cancellablePromise(validateCollection(validationRequest.mods, validationRequest.collection));
			validationPromiseRef.current = validationPromise;

			try {
				const result = await validationPromise.promise;
				return await processValidationResult(result, launchIfValid, validationRequest);
			} catch (error) {
				const wrappedError = error as { cancelled?: boolean; error?: unknown };
				if (!wrappedError.cancelled) {
					api.logger.error(wrappedError.error);
					setValidationResult(undefined);
					setValidatingMods(false);
					return {
						type: 'validation-run-failed'
					} satisfies CollectionValidationRunOutcome;
				}

				return {
					type: 'cancelled'
				} satisfies CollectionValidationRunOutcome;
			}
		},
		[activeCollection, appState.config, appState.mods, cancelValidation, processValidationResult]
	);

	return {
		validatingMods,
		collectionErrors,
		lastValidationStatus,
		lastValidatedCollectionKey,
		validationResult,
		setCollectionErrors,
		cancelValidation,
		validateActiveCollection,
		resetValidationState
	};
}
