import type { AppConfig, ModCollection, ModDataOverride } from 'model';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';

export function cloneCollection(collection: ModCollection): ModCollection {
	return {
		...collection,
		mods: [...collection.mods]
	};
}

export function copyCollectionsMap(collections: Map<string, ModCollection>) {
	return new Map<string, ModCollection>(collections);
}

function cloneUserOverride(override: ModDataOverride): ModDataOverride {
	return {
		...override,
		tags: override.tags ? [...override.tags] : undefined
	};
}

export function cloneAppConfig(config: AppConfig): AppConfig {
	return {
		...config,
		viewConfigs: {
			main: config.viewConfigs.main
				? {
						...config.viewConfigs.main,
						columnActiveConfig: config.viewConfigs.main.columnActiveConfig
							? { ...config.viewConfigs.main.columnActiveConfig }
							: undefined,
						columnWidthConfig: config.viewConfigs.main.columnWidthConfig
							? { ...config.viewConfigs.main.columnWidthConfig }
							: undefined,
						columnOrder: config.viewConfigs.main.columnOrder ? [...config.viewConfigs.main.columnOrder] : undefined
				  }
				: undefined,
			blockLookup: config.viewConfigs.blockLookup
				? {
						...config.viewConfigs.blockLookup,
						columnActiveConfig: config.viewConfigs.blockLookup.columnActiveConfig
							? { ...config.viewConfigs.blockLookup.columnActiveConfig }
							: undefined,
						columnWidthConfig: config.viewConfigs.blockLookup.columnWidthConfig
							? { ...config.viewConfigs.blockLookup.columnWidthConfig }
							: undefined,
						columnOrder: config.viewConfigs.blockLookup.columnOrder ? [...config.viewConfigs.blockLookup.columnOrder] : undefined
				  }
				: undefined
		},
		ignoredValidationErrors: new Map(
			[...config.ignoredValidationErrors.entries()].map(([errorType, ignoredErrors]) => [
				errorType,
				Object.fromEntries(
					Object.entries(ignoredErrors).map(([uid, values]) => [uid, [...values]])
				)
			])
		),
		userOverrides: new Map(
			[...config.userOverrides.entries()].map(([uid, override]) => [uid, cloneUserOverride(override)])
		)
	};
}

export function withActiveCollection(config: AppConfig, activeCollection: string | undefined): AppConfig {
	return {
		...config,
		activeCollection
	};
}

export function updateAppCollectionState(
	appState: CollectionWorkspaceAppState,
	nextCollections: Map<string, ModCollection>,
	nextCollectionNames: Set<string>,
	nextActiveCollection: ModCollection | undefined,
	nextConfig: AppConfig
) {
	appState.updateState(
		{
			allCollections: nextCollections,
			allCollectionNames: nextCollectionNames,
			activeCollection: nextActiveCollection,
			config: nextConfig
		}
	);
}
