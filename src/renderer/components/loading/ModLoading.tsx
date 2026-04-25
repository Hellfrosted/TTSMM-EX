import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { AppConfig } from 'model/AppConfig';
import { ModType } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import { setupDescriptors, type SessionMods } from 'model/SessionMods';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { ProgressTypes } from 'shared/ipc';
import { StartupButton, StartupProgressBar, StartupStatusIcon } from './StartupPrimitives';

interface ModLoadingProps {
	appState: CollectionWorkspaceAppState;
	modLoadCompleteCallback: () => void;
}

export default function ModLoadingComponent({ appState, modLoadCompleteCallback }: ModLoadingProps) {
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

		void api
			.readModMetadata(config.localDir, allKnownMods)
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
	}, [allCollections, config.localDir, config.userOverrides, config.workshopID, forceReloadMods, retryCount, updateAppState]);

	const progressPercent = Math.min(100, Math.max(0, Math.round(progress * 100)));
	const statusLabel = loadError ? 'Mod scan needs attention' : progressPercent >= 100 ? 'Mod scan complete' : 'Scanning installed mods';
	const statusDetail = loadError ? 'Fix the error below and retry the scan.' : progressMessage || 'Counting mods';
	const statusIcon = loadError ? 'error' : progressPercent >= 100 ? 'success' : 'loading';

	return (
		<div className="StartupShell">
			<main className="StartupContent">
				<section aria-labelledby="mod-loading-title" className="StartupCard">
					<span className="StartupEyebrow">Startup</span>
					<h2 id="mod-loading-title" className="StartupTitle">
						Scanning your mods
					</h2>
					<p className="StartupIntro">Refreshing local and workshop metadata before the collection workspace opens.</p>
					<div aria-live="polite" role="status" className={`StartupStatusCard${loadError ? ' is-error' : ''}`}>
						<div className="StartupStatusCard__content">
							<StartupStatusIcon status={statusIcon} />
							<span>
								<strong className="StartupStatusTitle">{statusLabel}</strong>
								<span className="StartupStatusDetail">{statusDetail}</span>
							</span>
						</div>
					</div>
					<StartupProgressBar percent={progressPercent} status={loadError ? 'exception' : progressPercent >= 100 ? 'success' : 'active'} />
					{loadError ? (
						<div className="StartupActions">
							<code className="StartupErrorText">{loadError}</code>
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
						</div>
					) : null}
				</section>
			</main>
		</div>
	);
}
