import { useCallback, useEffect, useRef, useState } from 'react';
import api from 'renderer/Api';
import logo_steamworks from '../../../../assets/logo_steamworks.svg';
import { useAppStateSelector } from 'renderer/state/app-state';
import StatusCallout from '../StatusCallout';
import { StartupActions, StartupButton, StartupStatusIcon } from './StartupPrimitives';

interface VerificationMessage {
	inited: boolean;
	error?: string;
}

function describeSteamworksError(error: string | undefined) {
	const normalizedError = (error || '').toLowerCase();

	if (normalizedError.includes('steam unavailable') || normalizedError.includes('steam is not running')) {
		return {
			title: 'Steam is not available right now.',
			detail: 'Start Steam, sign in, then retry the Steamworks check.'
		};
	}

	if (
		normalizedError.includes('dll') ||
		normalizedError.includes('module') ||
		normalizedError.includes('greenworks') ||
		normalizedError.includes('steamworks')
	) {
		return {
			title: 'The Steamworks files are not ready on this machine.',
			detail: 'Make sure Steamworks dependencies are installed for this build, then retry.'
		};
	}

	return {
		title: 'Steamworks could not be initialized.',
		detail: 'Start Steam, confirm this build has its Steamworks files available, then retry.'
	};
}

export default function SteamworksVerification() {
	const config = useAppStateSelector((state) => state.config);
	const initializedConfigs = useAppStateSelector((state) => state.initializedConfigs);
	const navigate = useAppStateSelector((state) => state.navigate);
	const updateState = useAppStateSelector((state) => state.updateState);
	const [verifying, setVerifying] = useState(true);
	const [error, setError] = useState<string>();
	const appStateRef = useRef({ config, initializedConfigs, navigate, updateState });
	const mountedRef = useRef(true);
	const timeoutIdsRef = useRef<number[]>([]);

	useEffect(() => {
		appStateRef.current = { config, initializedConfigs, navigate, updateState };
	}, [config, initializedConfigs, navigate, updateState]);

	const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
		if (!mountedRef.current) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
			if (!mountedRef.current) {
				return;
			}
			callback();
		}, delay);
		timeoutIdsRef.current.push(timeoutId);
	}, []);

	const goToConfig = useCallback(() => {
		const { config, initializedConfigs: initialized, navigate, updateState } = appStateRef.current;
		if (!initialized) {
			updateState({ initializedConfigs: true });
			navigate('/loading/config');
			return;
		}

		const nextPath = '/collections/main';
		if (config.currentPath !== nextPath) {
			updateState({
				config: {
					...config,
					currentPath: nextPath
				}
			});
		}
		navigate(nextPath);
	}, []);

	const processVerificationMessage = useCallback(
		(message: VerificationMessage) => {
			scheduleTimeout(() => {
				if (message.inited) {
					setError(undefined);
				} else {
					setError(message.error);
				}
				setVerifying(false);
				if (message.inited) {
					scheduleTimeout(() => {
						goToConfig();
					}, 500);
				}
			}, 100);

			return message.inited;
		},
		[goToConfig, scheduleTimeout]
	);

	const processVerificationFailure = useCallback(
		(cause: unknown) => {
			const message = cause instanceof Error ? cause.message : String(cause);
			scheduleTimeout(() => {
				setError(message);
				setVerifying(false);
			}, 100);
		},
		[scheduleTimeout]
	);

	useEffect(() => {
		mountedRef.current = true;
		void api
			.steamworksInited()
			.then(processVerificationMessage)
			.catch((error) => {
				api.logger.error(error);
				processVerificationFailure(error);
			});
		return () => {
			mountedRef.current = false;
			timeoutIdsRef.current.forEach((timeoutId) => {
				window.clearTimeout(timeoutId);
			});
			timeoutIdsRef.current = [];
		};
	}, [processVerificationFailure, processVerificationMessage]);

	function verify() {
		setError(undefined);
		setVerifying(true);
		void api
			.steamworksInited()
			.then(processVerificationMessage)
			.catch((error) => {
				api.logger.error(error);
				processVerificationFailure(error);
			});
	}

	const describedError = error ? describeSteamworksError(error) : undefined;
	const statusLabel = verifying
		? 'Checking Steamworks integration'
		: error
			? describedError?.title || 'Steamworks initialization failed'
			: 'Steamworks is ready';
	const statusDetail = verifying
		? 'Confirming the manager can talk to Steam before restoring your saved workspace.'
		: error
			? describedError?.detail || 'Retry after Steam is running and the Steamworks dependencies are available on this machine.'
			: 'Continuing to mod collections.';
	const statusIcon = verifying ? 'loading' : error ? 'error' : 'success';

	return (
		<div className="StartupShell">
			<main className="StartupContent">
				<section aria-labelledby="steamworks-title" className="StartupCard StartupCard--wide">
					<div className="StartupHeroRow">
						<div className="StartupHeroCopy">
							<span className="StartupEyebrow">Startup</span>
							<h2 id="steamworks-title" className="StartupTitle">
								Verifying Steamworks access
							</h2>
							<p className="StartupIntro">
								The manager checks Steamworks before loading your configuration so workshop subscriptions and launch actions stay reliable.
							</p>
						</div>
						<div className="StartupHeroArtwork">
							<img src={logo_steamworks} width={240} alt="Steamworks logo" key="steamworks" />
						</div>
					</div>
					<div aria-live="polite" role="status" className={`StartupStatusCard${error ? ' is-error' : ''}`}>
						<div className="StartupStatusCard__content StartupStatusCard__content--large">
							<StartupStatusIcon status={statusIcon} size={64} />
							<span>
								<strong className="StartupStatusTitle">{statusLabel}</strong>
								<span className="StartupStatusDetail">{statusDetail}</span>
							</span>
						</div>
					</div>
					{error ? (
						<StartupActions key="error">
							<StatusCallout tone="error" heading={describedError?.title || 'Resolve this before retrying'}>
								{describedError?.detail || error}
							</StatusCallout>
						</StartupActions>
					) : null}
					{error ? (
						<StartupActions key="retry">
							<StartupButton variant="primary" onClick={verify} loading={verifying}>
								Try Steamworks Again
							</StartupButton>
						</StartupActions>
					) : null}
				</section>
			</main>
		</div>
	);
}
