import { useEffect, useEffectEvent, useState } from 'react';
import { Layout, Progress, Typography } from 'antd';
import { AppConfig, AppConfigKeys, ModCollection } from 'model';
import api from 'renderer/Api';
import { DEFAULT_CONFIG } from 'renderer/Constants';
import { useAppDispatch, useAppState, setActiveCollection, setAppConfig, setCollectionsState } from 'renderer/state/app-state';
import { APP_THEME_COLORS } from 'renderer/theme';
import { tryWriteConfig } from 'renderer/util/config-write';
import { validateSettingsPath } from 'util/Validation';

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;

function normalizeCurrentPath(currentPath: string | undefined): string {
	if (!currentPath) {
		return '/collections/main';
	}

	const normalizedPath = currentPath.startsWith('/') ? currentPath : `/${currentPath}`;
	if (normalizedPath === '/collections') {
		return '/collections/main';
	}

	return normalizedPath;
}

function shouldAutoDiscoverGameExec(config: AppConfig, hasStoredConfig: boolean): boolean {
	if (window.electron.platform === 'linux') {
		return false;
	}

	const configuredPath = config.gameExec?.trim();
	if (!configuredPath) {
		return true;
	}

	return !hasStoredConfig || configuredPath === DEFAULT_CONFIG.gameExec;
}

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

export default function ConfigLoading() {
	const appState = useAppState();
	const dispatch = useAppDispatch();
	const { allCollectionNames, allCollections, config, configErrors } = appState;
	const [loadingConfig, setLoadingConfig] = useState(true);
	const [userDataPathError, setUserDataPathError] = useState<string>();
	const [configLoadError, setConfigLoadError] = useState<string>();
	const [bootPersistenceError, setBootPersistenceError] = useState<string>();
	const [collectionLoadError, setCollectionLoadError] = useState<string>();
	const [loadedCollections, setLoadedCollections] = useState(0);
	const [totalCollections, setTotalCollections] = useState(-1);
	const [updatingSteamMod, setUpdatingSteamMod] = useState(true);
	const [bootResolved, setBootResolved] = useState(false);

	const readUserDataPath = useEffectEvent(async () => {
		try {
			const path = await api.getUserDataPath();
			appState.updateState({ userDataPath: path });
		} catch (error) {
			api.logger.error(error);
			setUserDataPathError(String(error));
		}
	});

	const validateConfig = useEffectEvent(async (nextConfig: AppConfig) => {
		appState.updateState({ configErrors: {} });
		try {
			const result = await validateAppConfig(nextConfig);
			appState.updateState({ configErrors: result });
		} catch (error) {
			api.logger.error(error);
			appState.updateState({
				configErrors: {
					undefined: `Internal exception while validating AppConfig:\n${String(error)}`
				}
			});
		} finally {
			setLoadingConfig(false);
		}
	});

	const populateDiscoveredGameExec = useEffectEvent(async (baseConfig: AppConfig, hasStoredConfig: boolean) => {
		if (!shouldAutoDiscoverGameExec(baseConfig, hasStoredConfig)) {
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
			const response = await api.readConfig();
			if (response) {
				const discoveredConfig = await populateDiscoveredGameExec(response as AppConfig, true);
				dispatch(setAppConfig(discoveredConfig));
				await validateConfig(discoveredConfig);
			} else {
				api.logger.info('No config present - using default config');
				const discoveredConfig = await populateDiscoveredGameExec(DEFAULT_CONFIG, false);
				dispatch(setAppConfig(discoveredConfig));
				await validateConfig(discoveredConfig);
			}
		} catch (error) {
			api.logger.error(error);
			setConfigLoadError(String(error));
			setLoadingConfig(false);
		}
	});

	const updateSteamMod = useEffectEvent(() => {
		setUpdatingSteamMod(false);
	});

	const loadCollections = useEffectEvent(async () => {
		try {
			const collectionNames = (await api.readCollectionsList()) || [];
			setTotalCollections(collectionNames.length);

			const nextCollections = new Map<string, ModCollection>();
			const nextCollectionNames = new Set<string>();
			const loadedCollectionResults = await Promise.allSettled(
				collectionNames.map(async (collectionName) => {
					try {
						const collection = await api.readCollection(collectionName);
						return { collectionName, collection };
					} finally {
						setLoadedCollections((current) => current + 1);
					}
				})
			);

			const rejectedCollectionLoad = loadedCollectionResults.find(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			);
			if (rejectedCollectionLoad) {
				throw rejectedCollectionLoad.reason;
			}

			loadedCollectionResults.forEach((result) => {
				if (result.status !== 'fulfilled') {
					return;
				}

				const { collection } = result.value;
				if (!collection) {
					return;
				}

				nextCollections.set(collection.name, collection);
				nextCollectionNames.add(collection.name);
			});

			dispatch(setCollectionsState(nextCollections, nextCollectionNames));
		} catch (error) {
			api.logger.error(error);
			setCollectionLoadError(String(error));
			setTotalCollections(0);
		}
	});

	const haltBootOnPersistenceFailure = useEffectEvent((message: string) => {
		api.logger.warn(message);
		setBootPersistenceError(message);
	});

	const proceedToNext = useEffectEvent((baseConfig?: AppConfig) => {
		const resolvedConfig = baseConfig || config;
		if (!!configErrors && Object.keys(configErrors).length > 0) {
			const nextConfig = {
				...resolvedConfig,
				currentPath: '/settings'
			};
			appState.updateState({ config: nextConfig, loadingMods: false });
			appState.navigate('/settings');
			return;
		}

		const currentPath = normalizeCurrentPath(resolvedConfig.currentPath);
		const nextConfig = {
			...resolvedConfig,
			currentPath
		};
		appState.updateState({ config: nextConfig, loadingMods: true });
		appState.navigate(currentPath);
	});

	useEffect(() => {
		void readUserDataPath();
		void readConfig();
		void loadCollections();
		updateSteamMod();
	}, []);

	useEffect(() => {
		if (
			bootResolved ||
			bootPersistenceError ||
			configLoadError ||
			collectionLoadError ||
			updatingSteamMod ||
			totalCollections < 0 ||
			loadedCollections < totalCollections ||
			loadingConfig
		) {
			return;
		}

		setBootResolved(true);
		void (async () => {
			if (allCollectionNames.size > 0) {
				if (config && config.activeCollection) {
					const collection = allCollections.get(config.activeCollection);
					if (collection) {
						dispatch(setActiveCollection(collection));
						proceedToNext(config);
						return;
					}
				}

				const [collectionName] = [...allCollectionNames].sort();
				const nextConfig = {
					...config,
					activeCollection: collectionName
				};
				const persistedActiveCollection = await tryWriteConfig(nextConfig);
				if (!persistedActiveCollection) {
					haltBootOnPersistenceFailure(`Failed to persist repaired active collection ${collectionName}`);
					return;
				}
				dispatch(setAppConfig(nextConfig));
				dispatch(setActiveCollection(allCollections.get(collectionName)));
				proceedToNext(nextConfig);
				return;
			}

			const defaultCollection: ModCollection = {
				mods: [],
				name: 'default'
			};
			const createdDefaultCollection = await api.updateCollection(defaultCollection);
			if (!createdDefaultCollection) {
				haltBootOnPersistenceFailure('Failed to persist the default collection during boot');
				return;
			}
			const nextCollections = new Map(allCollections);
			nextCollections.set(defaultCollection.name, defaultCollection);
			const nextCollectionNames = new Set(allCollectionNames);
			nextCollectionNames.add(defaultCollection.name);
			const nextConfig = {
				...config,
				activeCollection: defaultCollection.name
			};
			const persistedActiveCollection = await tryWriteConfig(nextConfig);
			if (!persistedActiveCollection) {
				haltBootOnPersistenceFailure('Failed to persist the default active collection during boot');
				return;
			}
			dispatch(
				setCollectionsState(nextCollections, nextCollectionNames, defaultCollection)
			);
			dispatch(setAppConfig(nextConfig));
			proceedToNext(nextConfig);
		})();
	}, [
		allCollectionNames,
		allCollections,
		config,
		configErrors,
		bootResolved,
		bootPersistenceError,
		configLoadError,
		dispatch,
		collectionLoadError,
		loadedCollections,
		loadingConfig,
		totalCollections,
		updatingSteamMod
	]);

	const percent = totalCollections > 0 ? Math.ceil((100 * loadedCollections) / totalCollections) : 100;
	const bootError = configLoadError || bootPersistenceError || userDataPathError || collectionLoadError;
	const statusLabel = bootError ? 'Startup needs attention' : 'Preparing your mod manager';
	const statusDetail = bootError
		? 'Fix the issue below before the app can continue.'
		: totalCollections > 0
			? `Loaded ${loadedCollections} of ${totalCollections} saved collection${totalCollections === 1 ? '' : 's'}.`
			: 'Checking your saved settings and creating a default collection if this is your first launch.';

	return (
		<Layout className="StartupShell">
			<Content className="StartupContent">
				<section aria-labelledby="boot-title" className="StartupCard">
					<Text type="secondary">Startup</Text>
					<Title id="boot-title" level={2} style={{ marginTop: 10, marginBottom: 8 }}>
						Preparing TTSMM-EX
					</Title>
					<Paragraph className="StartupIntro">
						Restoring your saved configuration, checking required paths, and loading your collections before the mod workspace appears.
					</Paragraph>
					<div aria-live="polite" role="status" className={`StartupStatusCard${bootError ? ' is-error' : ''}`}>
						<Text strong className="StartupStatusTitle">
							{statusLabel}
						</Text>
						<Text className="StartupStatusDetail">{statusDetail}</Text>
					</div>
					<Progress
						className="StartupProgress"
						percent={percent}
						showInfo={!bootError}
						status={bootError ? 'exception' : 'active'}
						strokeColor={APP_THEME_COLORS.primary}
						railColor={APP_THEME_COLORS.border}
					/>
					{bootError ? (
						<div className="StartupActions">
							<Text code type="danger">
								{bootError}
							</Text>
						</div>
					) : null}
				</section>
			</Content>
		</Layout>
	);
}
