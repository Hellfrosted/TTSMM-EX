import { useEffect, useEffectEvent, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppConfigKeys, type AppConfig } from 'model/AppConfig';
import api from 'renderer/Api';
import { DEFAULT_CONFIG } from 'renderer/Constants';
import { useAppStateSelector } from 'renderer/state/app-state';
import StatusCallout from '../StatusCallout';
import {
	StartupActions,
	StartupCard,
	StartupEyebrow,
	StartupIntro,
	StartupProgressBar,
	StartupScreen,
	StartupStatusCard,
	StartupStatusDetail,
	StartupStatusTitle,
	StartupTitle
} from './StartupPrimitives';
import { tryWriteConfig } from 'renderer/util/config-write';
import { applyAuthoritativeCollectionStateToCache, configQueryOptions } from 'renderer/async-cache';
import { validateSettingsPath } from 'util/Validation';
import { applyAuthoritativeCollectionState } from 'renderer/authoritative-collection-state';
import { describeStartupBootError, resolveStartupNavigation, shouldAutoDiscoverGameExec } from 'renderer/startup-loading';

async function validateAppConfig(config: AppConfig): Promise<{ [field: string]: string } | undefined> {
	const errors: { [field: string]: string } = {};
	const checks: { field: AppConfigKeys; label: string; task: Promise<string | undefined> | undefined }[] = [
		...(window.electron.platform === 'linux'
			? []
			: [
					{
						field: AppConfigKeys.GAME_EXEC,
						label: 'TerraTech executable',
						task: validateSettingsPath(AppConfigKeys.GAME_EXEC, config.gameExec)
					}
				]),
		{
			field: AppConfigKeys.LOCAL_DIR,
			label: 'TerraTech Local Mods directory',
			task: config.localDir && config.localDir.length > 0 ? validateSettingsPath(AppConfigKeys.LOCAL_DIR, config.localDir) : undefined
		}
	];
	let failed = false;
	await Promise.allSettled(checks.map((check) => check.task)).then((results) => {
		results.forEach((result, index) => {
			const check = checks[index];
			if (result.status !== 'fulfilled') {
				errors[check.field] = `Unexpected error checking ${check.field} path (${check.label})`;
				failed = true;
			} else if (result.value !== undefined) {
				errors[check.field] = result.value;
				failed = true;
			}
		});

		return failed;
	});

	if (failed) {
		return errors;
	}
	return {};
}

interface ConfigLoadingState {
	bootPersistenceError?: string;
	bootResolved: boolean;
	configLoadError?: string;
	loadedCollections: number;
	loadingConfig: boolean;
	totalCollections: number;
	updatingSteamMod: boolean;
	userDataPathError?: string;
}

type ConfigLoadingAction =
	| { type: 'user-data-path-failed'; message: string }
	| { type: 'config-load-failed'; message: string }
	| { type: 'config-loaded' }
	| { type: 'steam-mod-updated' }
	| { type: 'boot-persistence-failed'; message: string }
	| { type: 'boot-started' }
	| { type: 'collections-loaded'; totalCollections: number };

function reduceConfigLoadingState(state: ConfigLoadingState, action: ConfigLoadingAction): ConfigLoadingState {
	switch (action.type) {
		case 'user-data-path-failed':
			return {
				...state,
				userDataPathError: action.message
			};
		case 'config-load-failed':
			return {
				...state,
				configLoadError: action.message,
				loadingConfig: false
			};
		case 'config-loaded':
			return {
				...state,
				loadingConfig: false
			};
		case 'steam-mod-updated':
			return {
				...state,
				updatingSteamMod: false
			};
		case 'boot-persistence-failed':
			return {
				...state,
				bootPersistenceError: action.message
			};
		case 'boot-started':
			return {
				...state,
				bootResolved: true
			};
		case 'collections-loaded':
			return {
				...state,
				loadedCollections: action.totalCollections,
				totalCollections: action.totalCollections
			};
	}
}

export default function ConfigLoading() {
	const queryClient = useQueryClient();
	const config = useAppStateSelector((state) => state.config);
	const configErrors = useAppStateSelector((state) => state.configErrors);
	const navigateApp = useAppStateSelector((state) => state.navigate);
	const updateAppState = useAppStateSelector((state) => state.updateState);
	const [state, dispatchLoading] = useReducer(reduceConfigLoadingState, {
		bootPersistenceError: undefined,
		bootResolved: false,
		configLoadError: undefined,
		loadedCollections: 0,
		loadingConfig: true,
		totalCollections: -1,
		updatingSteamMod: true,
		userDataPathError: undefined
	});
	const {
		bootPersistenceError,
		bootResolved,
		configLoadError,
		loadedCollections,
		loadingConfig,
		totalCollections,
		updatingSteamMod,
		userDataPathError
	} = state;

	const readUserDataPath = useEffectEvent(async () => {
		try {
			const path = await api.getUserDataPath();
			updateAppState({ userDataPath: path });
		} catch (error) {
			api.logger.error(error);
			dispatchLoading({ type: 'user-data-path-failed', message: String(error) });
		}
	});

	const validateConfig = useEffectEvent(async (nextConfig: AppConfig) => {
		updateAppState({ configErrors: {} });
		try {
			const result = await validateAppConfig(nextConfig);
			updateAppState({ configErrors: result });
		} catch (error) {
			api.logger.error(error);
			updateAppState({
				configErrors: {
					undefined: `Internal exception while validating AppConfig:\n${String(error)}`
				}
			});
		} finally {
			dispatchLoading({ type: 'config-loaded' });
		}
	});

	const populateDiscoveredGameExec = useEffectEvent(async (baseConfig: AppConfig, hasStoredConfig: boolean) => {
		if (!shouldAutoDiscoverGameExec(baseConfig, hasStoredConfig, window.electron.platform)) {
			return baseConfig;
		}

		try {
			const discoveredGameExec = await api.discoverGameExecutable();
			if (!discoveredGameExec || discoveredGameExec === baseConfig.gameExec) {
				return baseConfig;
			}

			const nextConfig = {
				...baseConfig,
				gameExec: discoveredGameExec
			};
			const persisted = await tryWriteConfig(nextConfig);
			if (!persisted) {
				api.logger.warn(`Failed to persist auto-discovered TerraTech executable: ${discoveredGameExec}`);
				return baseConfig;
			}
			return nextConfig;
		} catch (error) {
			api.logger.error('Failed to auto-discover TerraTech executable');
			api.logger.error(error);
			return baseConfig;
		}
	});

	const readConfig = useEffectEvent(async () => {
		try {
			const response = await queryClient.fetchQuery(configQueryOptions());
			if (response) {
				const discoveredConfig = await populateDiscoveredGameExec(response as AppConfig, true);
				updateAppState({ config: discoveredConfig });
				await validateConfig(discoveredConfig);
			} else {
				api.logger.info('No config present - using default config');
				const discoveredConfig = await populateDiscoveredGameExec(DEFAULT_CONFIG, false);
				updateAppState({ config: discoveredConfig });
				await validateConfig(discoveredConfig);
			}
		} catch (error) {
			api.logger.error(error);
			dispatchLoading({ type: 'config-load-failed', message: String(error) });
		}
	});

	const updateSteamMod = useEffectEvent(() => {
		dispatchLoading({ type: 'steam-mod-updated' });
	});

	const haltBootOnPersistenceFailure = useEffectEvent((message: string) => {
		api.logger.warn(message);
		dispatchLoading({ type: 'boot-persistence-failed', message });
	});

	useEffect(() => {
		void readUserDataPath();
		void readConfig();
		updateSteamMod();
	}, []);

	useEffect(() => {
		if (bootResolved || bootPersistenceError || configLoadError || updatingSteamMod || loadingConfig) {
			return;
		}

		dispatchLoading({ type: 'boot-started' });
		void (async () => {
			try {
				const result = await api.resolveStartupCollection({ config });
				if (!result.ok) {
					haltBootOnPersistenceFailure(result.message);
					return;
				}

				dispatchLoading({ type: 'collections-loaded', totalCollections: result.collectionNames.length });
				const navigation = resolveStartupNavigation(result.config, configErrors);
				const authoritativeResult = {
					...result,
					config: navigation.config
				};
				applyAuthoritativeCollectionState(authoritativeResult, {
					syncCache: (state) => applyAuthoritativeCollectionStateToCache(queryClient, state),
					updateState: (update) => updateAppState({ ...update, loadingMods: navigation.loadingMods })
				});
				navigateApp(navigation.path);
			} catch (error) {
				api.logger.error(error);
				haltBootOnPersistenceFailure(String(error));
				return;
			}
		})();
	}, [
		config,
		configErrors,
		bootResolved,
		bootPersistenceError,
		configLoadError,
		loadingConfig,
		navigateApp,
		queryClient,
		updateAppState,
		updatingSteamMod
	]);

	const percent = totalCollections > 0 ? Math.ceil((100 * loadedCollections) / totalCollections) : 100;
	const bootError = configLoadError || bootPersistenceError || userDataPathError;
	const describedBootError = bootError ? describeStartupBootError(bootError) : undefined;
	const statusLabel = bootError ? describedBootError?.title || 'Startup needs attention' : 'Preparing your mod manager';
	const statusDetail = bootError
		? describedBootError?.detail || 'Fix the issue below before the app can continue.'
		: totalCollections > 0
			? `Loaded ${loadedCollections} of ${totalCollections} saved collection${totalCollections === 1 ? '' : 's'}.`
			: 'Checking your saved settings and creating a default collection if this is your first launch.';

	return (
		<StartupScreen>
			<StartupCard aria-labelledby="boot-title">
				<StartupEyebrow>Startup</StartupEyebrow>
				<StartupTitle id="boot-title">Preparing TTSMM-EX</StartupTitle>
				<StartupIntro>
					Restoring your saved configuration, checking required paths, and loading your collections before the mod workspace appears.
				</StartupIntro>
				<StartupStatusCard aria-live="polite" role="status" error={!!bootError}>
					<StartupStatusTitle>{statusLabel}</StartupStatusTitle>
					<StartupStatusDetail>{statusDetail}</StartupStatusDetail>
				</StartupStatusCard>
				<StartupProgressBar percent={percent} showInfo={!bootError} status={bootError ? 'exception' : 'active'} />
				{bootError ? (
					<StartupActions>
						<StatusCallout tone="error" heading={describedBootError?.title || 'Resolve this before continuing'}>
							{describedBootError?.detail || bootError}
						</StatusCallout>
					</StartupActions>
				) : null}
			</StartupCard>
		</StartupScreen>
	);
}
