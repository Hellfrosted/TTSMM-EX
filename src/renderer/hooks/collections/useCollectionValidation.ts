import { useCallback, useEffect, useRef, useState } from 'react';
import { Cause, Effect, Exit, Fiber } from 'effect';
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
	type CollectionValidationRunOutcome,
	type CollectionWorkspaceValidationResult
} from 'renderer/collection-workspace-session';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
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

interface ActiveValidationFiber {
	cancel: () => void;
	promise: Promise<Exit.Exit<CollectionErrors, unknown>>;
}

function notifyValidationFailure(openNotification: UseCollectionValidationOptions['openNotification'], message: string) {
	openNotification?.(
		{
			message,
			placement: 'bottomLeft',
			duration: null
		},
		'error'
	);
}

export function useCollectionValidation({ appState, openNotification, persistCollection }: UseCollectionValidationOptions) {
	const [validatingMods, setValidatingMods] = useState(false);
	const [validationResult, setValidationResult] = useState<CollectionWorkspaceValidationResult>();
	const validationFiberRef = useRef<ActiveValidationFiber | undefined>(undefined);
	const { activeCollection, config, mods } = appState;
	const collectionErrors = validationResult?.errors;
	const lastValidationStatus = validationResult?.success;
	const lastValidatedCollectionKey = validationResult?.draftKey;

	useEffect(() => {
		return () => {
			validationFiberRef.current?.cancel();
		};
	}, []);

	const cancelValidation = useCallback(() => {
		validationFiberRef.current?.cancel();
		validationFiberRef.current = undefined;
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
				notifyValidationFailure(openNotification, 'Collection validated, but the saved collection could not be updated. Try saving again.');
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
		[appState, logValidationIssues, openNotification, persistCollection, renderCollectionErrors]
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
			const validationFiber = Effect.runFork(validateCollection(validationRequest.mods, validationRequest.collection));
			const activeValidation: ActiveValidationFiber = {
				cancel: () => {
					Effect.runFork(Fiber.interrupt(validationFiber));
				},
				promise: Effect.runPromise(Fiber.await(validationFiber))
			};
			validationFiberRef.current = activeValidation;

			const exit = await activeValidation.promise;
			const isCurrentValidation = validationFiberRef.current === activeValidation;
			if (isCurrentValidation) {
				validationFiberRef.current = undefined;
			}

			if (Exit.isSuccess(exit)) {
				if (!isCurrentValidation) {
					return {
						type: 'cancelled'
					} satisfies CollectionValidationRunOutcome;
				}
				return await processValidationResult(exit.value, launchIfValid, validationRequest);
			}

			if (Exit.isFailure(exit)) {
				if (!isCurrentValidation) {
					return {
						type: 'cancelled'
					} satisfies CollectionValidationRunOutcome;
				}
				if (Exit.hasInterrupts(exit)) {
					return {
						type: 'cancelled'
					} satisfies CollectionValidationRunOutcome;
				}

				api.logger.error(Cause.squash((exit as { cause: Cause.Cause<unknown> }).cause));
			}
			setValidationResult(undefined);
			setValidatingMods(false);
			notifyValidationFailure(openNotification, 'Collection validation did not complete. Check the mod list and try again.');
			return {
				type: 'validation-run-failed'
			} satisfies CollectionValidationRunOutcome;
		},
		[activeCollection, appState.config, appState.mods, cancelValidation, openNotification, processValidationResult]
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
