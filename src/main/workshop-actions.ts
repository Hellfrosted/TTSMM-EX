import type log from 'electron-log';
import type { ModData } from 'model/Mod';
import { ModType } from 'model/Mod';
import { cloneModData } from 'model/SessionMods';
import type { SteamworksStatus } from 'shared/ipc';
import Steamworks, { EResult, UGCItemState } from './steamworks';

interface WorkshopMetadataRefreshOptions {
	loadModDetailsFromPath: (mod: ModData, path: string, type: ModType) => Promise<ModData | null>;
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
): Promise<boolean> {
	if (status && status.readiness.kind !== 'ready') {
		return Promise.resolve(false);
	}

	return new Promise((resolve) => {
		try {
			action(
				(result: EResult | undefined) => {
					if (result === undefined || result === EResult.k_EResultOK) {
						resolve(true);
					} else {
						logger.error(`${failureMessage}. Status ${result.toString()}`);
						resolve(false);
					}
				},
				(error: Error) => {
					logger.error(failureMessage);
					logger.error(error);
					resolve(false);
				}
			);
		} catch (error) {
			logger.error(failureMessage);
			logger.error(error);
			resolve(false);
		}
	});
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

export async function refreshWorkshopMetadata(record: ModData, options: WorkshopMetadataRefreshOptions): Promise<ModData> {
	const update = cloneModData(record);
	if (!record.workshopID) {
		return update;
	}

	const runtimeState = applyWorkshopRuntimeState(update, options);
	if (runtimeState.installedPath) {
		try {
			await options.loadModDetailsFromPath(update, runtimeState.installedPath, record.type);
		} catch (error) {
			options.logger?.error(`Failed to refresh workshop metadata for ${record.workshopID}`);
			options.logger?.error(error);
		}
	}

	return update;
}
