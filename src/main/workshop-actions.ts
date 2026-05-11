import { Effect } from 'effect';
import type log from 'electron-log';
import type { ModData } from 'model/Mod';
import { ModType } from 'model/Mod';
import { cloneModData } from 'model/SessionMods';
import type { SteamworksStatus } from 'shared/ipc';
import Steamworks, { EResult, UGCItemState } from './steamworks';

interface WorkshopMetadataRefreshOptions {
	loadModDetailsFromPath: (mod: ModData, path: string, type: ModType) => Effect.Effect<ModData | null, unknown>;
	logger?: Pick<typeof log, 'error' | 'verbose' | 'warn'>;
	steamworks?: Pick<typeof Steamworks, 'ugcGetItemInstallInfo' | 'ugcGetItemState'>;
}

interface WorkshopRuntimeStateOptions {
	logger?: Pick<typeof log, 'error' | 'verbose' | 'warn'>;
	steamworks?: Pick<typeof Steamworks, 'ugcGetItemInstallInfo' | 'ugcGetItemState'>;
}

export function runSteamworksAction(
	status: SteamworksStatus | undefined,
	failureMessage: string,
	action: (success: (result: EResult) => void, failure: (error: Error) => void) => void,
	logger: Pick<typeof log, 'error'> = console
): Effect.Effect<boolean> {
	if (status && status.readiness.kind !== 'ready') {
		return Effect.succeed(false);
	}

	return Effect.callback<boolean>((resume) => {
		try {
			action(
				(result: EResult | undefined) => {
					if (result === undefined || result === EResult.k_EResultOK) {
						resume(Effect.succeed(true));
					} else {
						logger.error(`${failureMessage}. Status ${result.toString()}`);
						resume(Effect.succeed(false));
					}
				},
				(error: Error) => {
					logger.error(failureMessage);
					logger.error(error);
					resume(Effect.succeed(false));
				}
			);
		} catch (error) {
			logger.error(failureMessage);
			logger.error(error);
			resume(Effect.succeed(false));
		}
	}).pipe(
		Effect.catch((error) => {
			logger.error(failureMessage);
			logger.error(error);
			return Effect.succeed(false);
		})
	);
}

export function applyWorkshopRuntimeState(mod: ModData, options: WorkshopRuntimeStateOptions = {}): { installedPath?: string } {
	const steamworks = options.steamworks ?? Steamworks;
	if (!mod.workshopID) {
		return {};
	}

	try {
		const state: UGCItemState = steamworks.ugcGetItemState(mod.workshopID);
		if (state) {
			mod.subscribed = !!(state & UGCItemState.Subscribed);
			mod.installed = !!(state & UGCItemState.Installed);
			mod.downloadPending = !!(state & UGCItemState.DownloadPending);
			mod.downloading = !!(state & UGCItemState.Downloading);
			mod.needsUpdate = !!(state & UGCItemState.NeedsUpdate);
		}
	} catch (error) {
		options.logger?.warn(`Failed to read workshop item state for ${mod.workshopID}`);
		options.logger?.warn(error);
	}

	try {
		const installInfo = steamworks.ugcGetItemInstallInfo(mod.workshopID);
		if (installInfo) {
			options.logger?.verbose(`Workshop mod is installed at path: ${installInfo.folder}`);
			mod.lastUpdate = new Date(installInfo.timestamp * 1000);
			mod.size = parseInt(installInfo.sizeOnDisk, 10);
			mod.path = installInfo.folder;
			return { installedPath: installInfo.folder };
		}

		options.logger?.verbose(`FAILED to get install info for mod ${mod.workshopID}`);
		mod.lastUpdate = undefined;
		mod.path = undefined;
	} catch (error) {
		options.logger?.error(`Failed to read workshop install info for ${mod.workshopID}`);
		options.logger?.error(error);
	}

	return {};
}

export const refreshWorkshopMetadata = Effect.fnUntraced(function* (
	record: ModData,
	options: WorkshopMetadataRefreshOptions
): Effect.fn.Return<ModData> {
	const update = cloneModData(record);
	if (!record.workshopID) {
		return update;
	}

	const runtimeState = applyWorkshopRuntimeState(update, options);
	if (runtimeState.installedPath) {
		yield* options.loadModDetailsFromPath(update, runtimeState.installedPath, record.type).pipe(
			Effect.catch((error) => {
				options.logger?.error(`Failed to refresh workshop metadata for ${record.workshopID}`);
				options.logger?.error(error);
				return Effect.succeed(null);
			})
		);
	}

	return update;
});
