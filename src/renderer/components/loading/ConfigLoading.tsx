import { useEffect, useEffectEvent, useState } from 'react';
import { Layout, Progress } from 'antd';
import { AppConfig, AppConfigKeys, ModCollection } from 'model';
import api from 'renderer/Api';
import { DEFAULT_CONFIG } from 'renderer/Constants';
import { useAppDispatch, useAppState, setActiveCollection, setAppConfig, setCollectionsState } from 'renderer/state/app-state';
import { validateSettingsPath } from 'util/Validation';

const { Footer, Content } = Layout;

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
			const persisted = await api.updateConfig(nextConfig);
			if (!persisted) {
				api.logger.warn(`Failed to persist auto-discovered TerraTech executable: ${discoveredGameExec}`);
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
			const discoveredConfig = await populateDiscoveredGameExec(DEFAULT_CONFIG, false);
			dispatch(setAppConfig(discoveredConfig));
			await validateConfig(discoveredConfig);
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

			for (const collectionName of collectionNames) {
				const collection = await api.readCollection(collectionName);
				if (collection) {
					nextCollections.set(collection.name, collection);
					nextCollectionNames.add(collection.name);
				}
				setLoadedCollections((current) => current + 1);
			}

			dispatch(setCollectionsState(nextCollections, nextCollectionNames));
		} catch (error) {
			api.logger.error(error);
			setTotalCollections(0);
		}
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
		if (bootResolved || updatingSteamMod || totalCollections < 0 || loadedCollections < totalCollections || loadingConfig) {
			return;
		}

		setBootResolved(true);

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
			dispatch(setAppConfig(nextConfig));
			dispatch(setActiveCollection(allCollections.get(collectionName)));
			proceedToNext(nextConfig);
			return;
		}

		const defaultCollection: ModCollection = {
			mods: [],
			name: 'default'
		};
		const nextCollections = new Map(allCollections);
		nextCollections.set(defaultCollection.name, defaultCollection);
		const nextCollectionNames = new Set(allCollectionNames);
		nextCollectionNames.add(defaultCollection.name);
		dispatch(
			setCollectionsState(nextCollections, nextCollectionNames, defaultCollection)
		);
		dispatch(
			setAppConfig({
				...config,
				activeCollection: defaultCollection.name
			})
		);
		proceedToNext({
			...config,
			activeCollection: defaultCollection.name
		});
	}, [
		allCollectionNames,
		allCollections,
		config,
		configErrors,
		bootResolved,
		dispatch,
		loadedCollections,
		loadingConfig,
		totalCollections,
		updatingSteamMod
	]);

	const percent = totalCollections > 0 ? Math.ceil((100 * loadedCollections) / totalCollections) : 100;

	return (
		<Layout style={{ minHeight: '100vh', minWidth: '100vw' }}>
			<Content />
			<Footer>
				<Progress
					strokeColor={{
						from: '#108ee9',
						to: '#87d068'
					}}
					percent={percent}
					status={configLoadError || userDataPathError ? 'exception' : undefined}
				/>
			</Footer>
		</Layout>
	);
}
