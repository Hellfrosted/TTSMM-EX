import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppConfig } from 'model/AppConfig';
import { ModType } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import { setupDescriptors, type SessionMods } from 'model/SessionMods';
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

export default function ModLoadingComponent({ appState, modLoadCompleteCallback }: ModLoadingProps) {
	const queryClient = useQueryClient();
	const { allCollections, config: rawConfig, forceReloadMods, updateState: updateAppState } = appState;
	const config = rawConfig as AppConfig;
	const [progress, setProgress] = useState(0);
	const [progressMessage, setProgressMessage] = useState('Counting mods');
	const [loadError, setLoadError] = useState<string>();
	const [retryCount, setRetryCount] = useState(0);
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
				setProgress(nextProgress);
				setProgressMessage(nextProgressMessage);
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
					attempt: retryCount
				})
			)
			.then((mods) => {
				if (loadRequestIdRef.current !== requestId) {
					return mods;
				}
				setupDescriptors(mods as SessionMods, config.userOverrides);
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
				setLoadError(error instanceof Error ? error.message : String(error));
			});

		return () => {
			unsubscribeProgress();
			if (loadRequestIdRef.current === requestId) {
				loadRequestIdRef.current += 1;
			}
		};
	}, [allCollections, config.localDir, config.userOverrides, config.workshopID, forceReloadMods, queryClient, retryCount, updateAppState]);

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
								setLoadError(undefined);
								setProgress(0);
								setProgressMessage('Counting mods');
								setRetryCount((current) => current + 1);
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
