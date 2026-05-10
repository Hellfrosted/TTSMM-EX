import { useEffect, useEffectEvent, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppConfig } from 'model/AppConfig';
import { createModManagerUid, type ModDataOverride } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import type { SessionMods } from 'model/SessionMods';
import api from 'renderer/Api';
import { modMetadataQueryOptions } from 'renderer/async-cache';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { formatErrorMessage } from 'renderer/util/error-message';
import { ProgressTypes } from 'shared/ipc';
import StatusCallout from '../StatusCallout';
import {
	StartupActions,
	StartupButton,
	StartupCard,
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

function getKnownModIds(allCollections: Map<string, ModCollection>, workshopID: AppConfig['workshopID'], forceReloadMods: boolean) {
	const knownMods = forceReloadMods
		? new Set<string>()
		: new Set([...allCollections.values()].map((value: ModCollection) => value.mods).flat());
	knownMods.add(createModManagerUid(workshopID));
	return [...knownMods].sort();
}

function getUserOverridesKey(userOverrides: Map<string, ModDataOverride>) {
	return JSON.stringify(
		[...userOverrides.entries()]
			.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
			.map(([uid, override]) => [uid, override.id ?? null, override.tags ? [...override.tags].sort() : []])
	);
}

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
	const { allCollections, config: rawConfig, forceReloadMods, loadingMods, updateState: updateAppState } = appState;
	const config = rawConfig as AppConfig;
	const [state, dispatchLoading] = useReducer(reduceModLoadingState, {
		loadError: undefined,
		progress: 0,
		progressMessage: 'Counting mods',
		retryCount: 0
	});
	const { loadError, progress, progressMessage, retryCount } = state;
	const loadRequestIdRef = useRef(0);
	const userOverridesRef = useRef(config.userOverrides);
	userOverridesRef.current = config.userOverrides;
	const metadataScanKey = `${getKnownModIds(allCollections, config.workshopID, !!forceReloadMods).join('\n')}\u0000${getUserOverridesKey(config.userOverrides)}`;
	const commitModLoad = useEffectEvent((mods: SessionMods) => {
		updateAppState({
			mods,
			firstModLoad: true,
			loadingMods: false,
			forceReloadMods: false
		});
		modLoadCompleteCallback();
	});

	useEffect(() => {
		if (!loadingMods) {
			return;
		}

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

		const knownModIdsKey = metadataScanKey.split('\u0000', 1)[0];
		const allKnownMods = new Set(knownModIdsKey ? knownModIdsKey.split('\n') : []);

		void queryClient
			.fetchQuery(
				modMetadataQueryOptions({
					localDir: config.localDir,
					knownMods: allKnownMods,
					forceReload: !!forceReloadMods,
					attempt: retryCount,
					userOverrides: userOverridesRef.current,
					treatNuterraSteamBetaAsEquivalent: config.treatNuterraSteamBetaAsEquivalent
				})
			)
			.then((mods) => {
				if (loadRequestIdRef.current !== requestId) {
					return mods;
				}
				commitModLoad(mods);
				return mods;
			})
			.catch((error) => {
				if (loadRequestIdRef.current !== requestId) {
					return;
				}
				api.logger.error(error);
				dispatchLoading({ type: 'failed', message: formatErrorMessage(error) });
			});

		return () => {
			unsubscribeProgress();
			if (loadRequestIdRef.current === requestId) {
				loadRequestIdRef.current += 1;
			}
		};
	}, [config.localDir, config.treatNuterraSteamBetaAsEquivalent, forceReloadMods, loadingMods, metadataScanKey, queryClient, retryCount]);

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
				<StartupStatusCard
					aria-live="polite"
					role="status"
					error={!!loadError}
					tone={!loadError && progressPercent >= 100 ? 'success' : 'default'}
				>
					<StartupStatusContent>
						<StartupStatusIcon status={statusIcon} />
						<span>
							<StartupStatusTitle>{statusLabel}</StartupStatusTitle>
							<StartupStatusDetail>{statusDetail}</StartupStatusDetail>
						</span>
					</StartupStatusContent>
				</StartupStatusCard>
				<StartupProgressBar
					label="Mod metadata scan progress"
					percent={progressPercent}
					status={loadError ? 'exception' : progressPercent >= 100 ? 'success' : 'active'}
				/>
				{loadError ? (
					<StartupActions>
						<StatusCallout className="[overflow-wrap:anywhere]" tone="error" heading="Metadata scan failed">
							{loadError}
						</StatusCallout>
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
