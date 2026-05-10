import { useCallback, useEffect, useReducer, useRef } from 'react';
import api from 'renderer/Api';
import logo_steamworks from '../../../../assets/logo_steamworks.svg';
import { useAppStateSelector } from 'renderer/state/app-state';
import type { SteamworksReadinessKind, SteamworksStatus } from 'shared/ipc';
import StatusCallout from '../StatusCallout';
import {
	StartupActions,
	StartupButton,
	StartupCard,
	StartupEyebrow,
	StartupHeroArtwork,
	StartupHeroCopy,
	StartupHeroRow,
	StartupIntro,
	StartupScreen,
	StartupStatusCard,
	StartupStatusContent,
	StartupStatusDetail,
	StartupStatusIcon,
	StartupStatusTitle,
	StartupTitle
} from './StartupPrimitives';

function describeSteamworksReadiness(kind: SteamworksReadinessKind) {
	switch (kind) {
		case 'bypassed':
			return {
				title: 'Steamworks is bypassed for this development run.',
				detail: 'Workshop metadata and Steam actions are disabled until the app is launched without TTSMM_BYPASS_STEAMWORKS.'
			};
		case 'steam-not-running':
			return {
				title: 'Steam is not available right now.',
				detail: 'Start Steam, sign in, then retry the Steamworks check.'
			};
		case 'wrong-app-id':
			return {
				title: 'Steam rejected this app ID for the signed-in account.',
				detail:
					'Sign in with an account that owns TerraTech, or launch with TTSMM_BYPASS_STEAMWORKS=1 for local UI work without Workshop access.'
			};
		case 'native-module-unavailable':
			return {
				title: 'The Steamworks files are not ready on this machine.',
				detail: 'Make sure Steamworks dependencies are installed for this build, then retry.'
			};
		case 'ready':
			return {
				title: 'Steamworks is ready',
				detail: 'Continuing to mod collections.'
			};
		case 'unknown-failure':
			return {
				title: 'Steamworks could not be initialized.',
				detail: 'Start Steam, confirm this build has its Steamworks files available, then retry.'
			};
	}
}

interface SteamworksVerificationState {
	error?: string;
	status?: SteamworksStatus;
	verifying: boolean;
}

type SteamworksVerificationAction =
	| { type: 'started' }
	| { type: 'resolved'; status: SteamworksStatus }
	| { type: 'failed'; message: string };

function reduceSteamworksVerificationState(
	state: SteamworksVerificationState,
	action: SteamworksVerificationAction
): SteamworksVerificationState {
	switch (action.type) {
		case 'started':
			return {
				...state,
				error: undefined,
				verifying: true
			};
		case 'resolved':
			return {
				error: action.status.inited ? undefined : action.status.error,
				status: action.status,
				verifying: false
			};
		case 'failed':
			return {
				...state,
				error: action.message,
				verifying: false
			};
	}
}

export default function SteamworksVerification() {
	const config = useAppStateSelector((state) => state.config);
	const initializedConfigs = useAppStateSelector((state) => state.initializedConfigs);
	const navigate = useAppStateSelector((state) => state.navigate);
	const updateState = useAppStateSelector((state) => state.updateState);
	const [state, dispatchVerification] = useReducer(reduceSteamworksVerificationState, {
		error: undefined,
		status: undefined,
		verifying: true
	});
	const { error, status, verifying } = state;
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
		(message: SteamworksStatus) => {
			scheduleTimeout(() => {
				dispatchVerification({ type: 'resolved', status: message });
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
				dispatchVerification({ type: 'failed', message });
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
		dispatchVerification({ type: 'started' });
		void api
			.steamworksInited()
			.then(processVerificationMessage)
			.catch((error) => {
				api.logger.error(error);
				processVerificationFailure(error);
			});
	}

	const describedReadiness = status ? describeSteamworksReadiness(status.readiness.kind) : undefined;
	const statusLabel = verifying
		? 'Checking Steamworks integration'
		: error
			? describedReadiness?.title || 'Steamworks initialization failed'
			: describedReadiness?.title || 'Steamworks is ready';
	const statusDetail = verifying
		? 'Confirming the manager can talk to Steam before restoring your saved workspace.'
		: error
			? describedReadiness?.detail || 'Retry after Steam is running and the Steamworks dependencies are available on this machine.'
			: describedReadiness?.detail || 'Continuing to mod collections.';
	const statusIcon = verifying ? 'loading' : error ? 'error' : 'success';

	return (
		<StartupScreen>
			<StartupCard aria-labelledby="steamworks-title" wide>
				<StartupHeroRow>
					<StartupHeroCopy>
						<StartupEyebrow>Startup</StartupEyebrow>
						<StartupTitle id="steamworks-title">Verifying Steamworks access</StartupTitle>
						<StartupIntro>
							The manager checks Steamworks before loading your configuration so workshop subscriptions and launch actions stay reliable.
						</StartupIntro>
					</StartupHeroCopy>
					<StartupHeroArtwork>
						<img src={logo_steamworks} width={240} alt="Steamworks logo" key="steamworks" />
					</StartupHeroArtwork>
				</StartupHeroRow>
				<StartupStatusCard aria-live="polite" role="status" error={!!error}>
					<StartupStatusContent large>
						<StartupStatusIcon status={statusIcon} size={64} />
						<span>
							<StartupStatusTitle>{statusLabel}</StartupStatusTitle>
							<StartupStatusDetail>{statusDetail}</StartupStatusDetail>
						</span>
					</StartupStatusContent>
				</StartupStatusCard>
				{error ? (
					<StartupActions key="error">
						<StatusCallout tone="error" heading={describedReadiness?.title || 'Resolve this before retrying'}>
							{describedReadiness?.detail || error}
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
			</StartupCard>
		</StartupScreen>
	);
}
