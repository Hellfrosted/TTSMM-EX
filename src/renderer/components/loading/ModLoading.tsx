import { useEffect, useEffectEvent, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppConfig } from 'model/AppConfig';
import { ModType } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import api from 'renderer/Api';
import { modMetadataQueryOptions } from 'renderer/async-cache';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { ProgressTypes } from 'shared/ipc';
import {
	StartupActions,
	StartupButton,
	StartupCard,
	StartupErrorText,
	StartupEyebrow,
	StartupIntro,
	StartupProgressBar,
	StartupScreen,
	StartupStatusCard,
	StartupStatusContent,
	StartupStatusDetail,
	StartupStatusIcon,
	StartupStatusTitle,
	StartupTitle
} from './StartupPrimitives';

interface ModLoadingProps {
	appState: CollectionWorkspaceAppState;
	modLoadCompleteCallback: () => void;
}

interface ModLoadingState {
	loadError?: string;
	progress: number;
	progressMessage: string;
	retryCount: number;
}

type ModLoadingAction = { type: 'progress'; progress: number; message: string } | { type: 'failed'; message: string } | { type: 'retry' };

function reduceModLoadingState(state: ModLoadingState, action: ModLoadingAction): ModLoadingState {
	switch (action.type) {
		case 'progress':
			return {
				...state,
				progress: action.progress,
				progressMessage: action.message
			};
		case 'failed':
			return {
				...state,
				loadError: action.message
			};
		case 'retry':
			return {
				loadError: undefined,
				progress: 0,
				progressMessage: 'Counting mods',
				retryCount: state.retryCount + 1
			};
	}
}

export default function ModLoadingComponent({ appState, modLoadCompleteCallback }: ModLoadingProps) {
	const queryClient = useQueryClient();
	const { allCollections, config: rawConfig, forceReloadMods, updateState: updateAppState } = appState;
	const config = rawConfig as AppConfig;
	const [state, dispatchLoading] = useReducer(reduceModLoadingState, {
		loadError: undefined,
		progress: 0,
		progressMessage: 'Counting mods',
		retryCount: 0
	});
	const { loadError, progress, progressMessage, retryCount } = state;
	const loadRequestIdRef = useRef(0);
	const completeModLoad = useEffectEvent(() => {
		modLoadCompleteCallback();
	});

	useEffect(() => {
		const requestId = loadRequestIdRef.current + 1;
		loadRequestIdRef.current = requestId;
		const unsubscribeProgress = api.onProgressChange((type: ProgressTypes, nextProgress: number, nextProgressMessage: string) => {
			if (loadRequestIdRef.current !== requestId) {
				return;
			}
			if (type === ProgressTypes.MOD_LOAD) {
				api.logger.silly(`Mod loading progress: ${nextProgress}`);
				dispatchLoading({ type: 'progress', progress: nextProgress, message: nextProgressMessage });
			}
		});

		const allKnownMods: Set<string> = forceReloadMods
			? new Set<string>()
			: new Set([...allCollections.values()].map((value: ModCollection) => value.mods).flat());
		allKnownMods.add(`${ModType.WORKSHOP}:${config.workshopID}`);

		void queryClient
			.fetchQuery(
				modMetadataQueryOptions({
					localDir: config.localDir,
					knownMods: allKnownMods,
					forceReload: !!forceReloadMods,
					attempt: retryCount,
					userOverrides: config.userOverrides,
					treatNuterraSteamBetaAsEquivalent: config.treatNuterraSteamBetaAsEquivalent
				})
			)
			.then((mods) => {
				if (loadRequestIdRef.current !== requestId) {
					return mods;
				}
				updateAppState({
					mods,
					firstModLoad: true,
					loadingMods: false,
					forceReloadMods: false
				});
				completeModLoad();
				return mods;
			})
			.catch((error) => {
				if (loadRequestIdRef.current !== requestId) {
					return;
				}
				api.logger.error(error);
				dispatchLoading({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
			});

		return () => {
			unsubscribeProgress();
			if (loadRequestIdRef.current === requestId) {
				loadRequestIdRef.current += 1;
			}
		};
	}, [
		allCollections,
		config.localDir,
		config.treatNuterraSteamBetaAsEquivalent,
		config.userOverrides,
		config.workshopID,
		forceReloadMods,
		queryClient,
		retryCount,
		updateAppState
	]);

	const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
	const statusLabel = loadError ? 'Mod scan needs attention' : progressPercent >= 100 ? 'Mod scan complete' : 'Scanning installed mods';
	const statusDetail = loadError ? 'Fix the error below and retry the scan.' : progressMessage || 'Counting mods';
	const statusIcon = loadError ? 'error' : progressPercent >= 100 ? 'success' : 'loading';

	return (
		<StartupScreen>
			<StartupCard aria-labelledby="mod-loading-title">
				<StartupEyebrow>Startup</StartupEyebrow>
				<StartupTitle id="mod-loading-title">Scanning your mods</StartupTitle>
				<StartupIntro>Refreshing local and workshop metadata before the collection workspace opens.</StartupIntro>
				<StartupStatusCard aria-live="polite" role="status" error={!!loadError}>
					<StartupStatusContent>
						<StartupStatusIcon status={statusIcon} />
						<span>
							<StartupStatusTitle>{statusLabel}</StartupStatusTitle>
							<StartupStatusDetail>{statusDetail}</StartupStatusDetail>
						</span>
					</StartupStatusContent>
				</StartupStatusCard>
				<StartupProgressBar percent={progressPercent} status={loadError ? 'exception' : progressPercent >= 100 ? 'success' : 'active'} />
				{loadError ? (
					<StartupActions>
						<StartupErrorText>{loadError}</StartupErrorText>
						<StartupButton
							variant="primary"
							onClick={() => {
								dispatchLoading({ type: 'retry' });
							}}
						>
							Retry Mod Scan
						</StartupButton>
					</StartupActions>
				) : null}
			</StartupCard>
		</StartupScreen>
	);
}
