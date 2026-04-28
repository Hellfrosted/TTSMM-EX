import { useMemo } from 'react';
import type { CollectionErrors } from 'model';
import { CollectionManagerModalType } from 'model';
import type { CollectionDirtyDraft } from './useCollections';

interface UseCollectionWorkspaceSessionOptions {
	dirtyDraft: CollectionDirtyDraft;
	savingCollection: boolean;
	validationIsCurrent: boolean;
	validationStatus: boolean | undefined;
	validationResult: CollectionErrors | undefined;
	validatingMods: boolean;
	loadingMods: boolean | undefined;
	launchingGame: boolean | undefined;
	modalType: CollectionManagerModalType;
	gameRunning: boolean | undefined;
	overrideGameRunning: boolean;
}

export function useCollectionWorkspaceSession({
	dirtyDraft,
	savingCollection,
	validationIsCurrent,
	validationStatus,
	validationResult,
	validatingMods,
	loadingMods,
	launchingGame,
	modalType,
	gameRunning,
	overrideGameRunning
}: UseCollectionWorkspaceSessionOptions) {
	return useMemo(() => {
		const currentValidationStatus = validationIsCurrent ? validationStatus : undefined;
		const currentValidationResult = validationIsCurrent ? validationResult : undefined;
		const launchInProgress = !!launchingGame;
		const launchDisabled =
			loadingMods || overrideGameRunning || gameRunning || modalType !== CollectionManagerModalType.NONE || launchInProgress;

		return {
			dirtyDraft,
			saveProgress: {
				savingCollection
			},
			validationProgress: {
				validatingMods
			},
			validationStatus: currentValidationStatus,
			validationResult: currentValidationResult,
			launchReadiness: {
				disabled: launchDisabled,
				launchingGame: launchInProgress,
				canLaunchValidatedDraft: currentValidationStatus === true && !dirtyDraft.hasChanges
			}
		};
	}, [
		dirtyDraft,
		gameRunning,
		launchingGame,
		loadingMods,
		modalType,
		overrideGameRunning,
		savingCollection,
		validatingMods,
		validationIsCurrent,
		validationResult,
		validationStatus
	]);
}

export type CollectionWorkspaceSession = ReturnType<typeof useCollectionWorkspaceSession>;
