import { shell, IpcMain, Menu, MenuItemConstructorOptions, WebContents } from 'electron';
import log from 'electron-log';

import {
	ModData,
	ModType,
	SessionMods,
	ValidChannel
} from '../../model';
import { openExternalUrl } from '../external-links';
import ModFetcher, { getModDetailsFromPath } from '../mod-fetcher';
import Steamworks, { EResult, UGCItemState } from '../steamworks';
import { fetchWorkshopDependencyLookup } from '../workshop-dependencies';

interface MainWindowProvider {
	getWebContents: () => WebContents | null;
}

interface SteamStatus {
	inited: boolean;
	error?: string;
}

function createSteamResultHandler(
	failureMessage: string,
	action: (success: (result: EResult) => void, failure: (error: Error) => void) => void
): Promise<boolean> {
	return new Promise((resolve) => {
		action(
			(result: EResult) => {
				if (result === EResult.k_EResultOK) {
					resolve(true);
				} else {
					log.error(`${failureMessage}. Status ${result.toString()}`);
					resolve(false);
				}
			},
			(error: Error) => {
				log.error(failureMessage);
				log.error(error);
				resolve(false);
			}
		);
	});
}

export function createDownloadModHandler(steamworks = Steamworks) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		return createSteamResultHandler(
			`Failed to download mod ${workshopID}`,
			(success, failure) => {
				steamworks.ugcDownloadItem(workshopID, success, failure);
			}
		);
	};
}

export function createSubscribeModHandler(steamworks = Steamworks) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		return createSteamResultHandler(
			`Failed to subscribe to mod ${workshopID}`,
			(success, failure) => {
				steamworks.ugcSubscribe(workshopID, success, failure);
			}
		);
	};
}

export function createUnsubscribeModHandler(steamworks = Steamworks) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		return createSteamResultHandler(
			`Failed to unsubscribe from mod ${workshopID}`,
			(success, failure) => {
				steamworks.ugcUnsubscribe(workshopID, success, failure);
			}
		);
	};
}

export function createReadModMetadataHandler() {
	return async (event: { sender: WebContents }, localDir: string | undefined, allKnownMods: string[]): Promise<SessionMods | null> => {
		const knownWorkshopMods: bigint[] = [];
		allKnownMods.forEach((uid: string) => {
			log.debug(`Found known mod ${uid}`);
			const parts: string[] = uid.split(':');
			if (parts.length === 2 && parts[0] === ModType.WORKSHOP) {
				try {
					log.debug(`Found workshop mod ${parts[1]}`);
					knownWorkshopMods.push(BigInt(parts[1]));
				} catch (error) {
					log.error(`Unable to parse workshop ID for mod ${uid}`);
					log.error(error);
				}
			}
		});

		const modFetcher = new ModFetcher(event.sender, localDir, knownWorkshopMods);
		try {
			const modsList = await modFetcher.fetchMods();
			return new SessionMods(localDir, modsList);
		} catch (error) {
			log.error('Failed to get mod info:');
			log.error(error);
			return null;
		}
	};
}

export function createSteamworksInitHandler(getSteamStatus: () => SteamStatus, tryInitSteamworks: () => SteamStatus) {
	return async (): Promise<SteamStatus> => {
		const status = getSteamStatus();
		if (status.inited) {
			return status;
		}
		return tryInitSteamworks();
	};
}

function createContextMenuTemplate(record: ModData, mainWindowProvider: MainWindowProvider): MenuItemConstructorOptions[] {
	const template: MenuItemConstructorOptions[] = [];
	if (record.path) {
		template.push({
			label: 'Show in Explorer',
			click: () => {
				shell.openPath(record.path!);
			}
		});
	}
	if (record.workshopID) {
		template.push({
			label: 'Show in Steam',
			click: () => {
				openExternalUrl(`steam://url/CommunityFilePage/${record.workshopID}`);
			}
		});
		template.push({
			label: 'Show in Browser',
			click: () => {
				openExternalUrl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${record.workshopID}`);
			}
		});
		template.push({ type: 'separator' });
		let metadataUpdateRequestId = 0;
		const getUpdatedInfo = async () => {
			const requestId = metadataUpdateRequestId + 1;
			metadataUpdateRequestId = requestId;
			const update = {
				lastUpdate: record.lastUpdate,
				size: record.size,
				path: record.path,
				installed: record.installed,
				downloadPending: record.downloadPending,
				downloading: record.downloading,
				needsUpdate: record.needsUpdate,
				id: record.id
			};
			const state: UGCItemState = Steamworks.ugcGetItemState(record.workshopID!);
			if (state) {
				update.installed = !!(state & UGCItemState.Installed);
				update.downloadPending = !!(state & UGCItemState.DownloadPending);
				update.downloading = !!(state & UGCItemState.Downloading);
				update.needsUpdate = !!(state & UGCItemState.NeedsUpdate);
			}
			const installInfo = Steamworks.ugcGetItemInstallInfo(record.workshopID!);
			if (installInfo) {
				log.verbose(`Workshop mod is installed at path: ${installInfo.folder}`);
				update.lastUpdate = new Date(installInfo.timestamp * 1000);
				update.size = parseInt(installInfo.sizeOnDisk, 10);
				update.path = installInfo.folder;

				await getModDetailsFromPath(update as ModData, installInfo.folder, record.type);
			} else {
				log.verbose(`FAILED to get install info for mod ${record.workshopID}`);
			}
			if (requestId !== metadataUpdateRequestId) {
				return;
			}
			mainWindowProvider
				.getWebContents()
				?.send(ValidChannel.MOD_METADATA_UPDATE, `${ModType.WORKSHOP}:${record.workshopID}`, update);
		};
		if (record.subscribed) {
			template.push({
				label: 'Unsubscribe',
				click: () => {
					Steamworks.ugcUnsubscribe(record.workshopID!, () => {
						log.verbose(`Unsubscribed from ${record.workshopID}`);
						mainWindowProvider
							.getWebContents()
							?.send(ValidChannel.MOD_METADATA_UPDATE, `${ModType.WORKSHOP}:${record.workshopID}`, { subscribed: false });
						getUpdatedInfo();
					});
				}
			});
		} else {
			template.push({
				label: 'Subscribe',
				click: () => {
					Steamworks.ugcSubscribe(record.workshopID!, () => {
						log.verbose(`Subscribed to ${record.workshopID}`);
						mainWindowProvider
							.getWebContents()
							?.send(ValidChannel.MOD_METADATA_UPDATE, `${ModType.WORKSHOP}:${record.workshopID}`, { subscribed: true });
						getUpdatedInfo();
					});
				}
			});
		}
		if (record.needsUpdate) {
			template.push({
				label: 'Update',
				click: () => {
					Steamworks.ugcDownloadItem(record.workshopID!, () => {
						log.verbose(`Updated ${record.workshopID}`);
						getUpdatedInfo();
					});
				}
			});
		}
	}
	return template;
}

export function createFetchWorkshopDependenciesHandler(
	mainWindowProvider: MainWindowProvider,
	workshopDependencyLookup = fetchWorkshopDependencyLookup
) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const dependencyLookup = await workshopDependencyLookup(workshopID);
		if (!dependencyLookup) {
			return false;
		}

		mainWindowProvider
			.getWebContents()
			?.send(ValidChannel.MOD_METADATA_UPDATE, `${ModType.WORKSHOP}:${workshopID}`, dependencyLookup);

		return true;
	};
}

export function registerModHandlers(
	ipcMain: IpcMain,
	mainWindowProvider: MainWindowProvider,
	getSteamStatus: () => SteamStatus,
	tryInitSteamworks: () => SteamStatus
) {
	ipcMain.on(ValidChannel.OPEN_MOD_STEAM, (_event, workshopID: bigint) => {
		openExternalUrl(`steam://url/CommunityFilePage/${workshopID}`);
	});

	ipcMain.on(ValidChannel.OPEN_MOD_BROWSER, (_event, workshopID: bigint) => {
		openExternalUrl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopID}`);
	});

	ipcMain.handle(ValidChannel.SUBSCRIBE_MOD, createSubscribeModHandler());
	ipcMain.handle(ValidChannel.UNSUBSCRIBE_MOD, createUnsubscribeModHandler());
	ipcMain.handle(ValidChannel.DOWNLOAD_MOD, createDownloadModHandler());
	ipcMain.handle(ValidChannel.READ_MOD_METADATA, createReadModMetadataHandler());
	ipcMain.handle(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, createFetchWorkshopDependenciesHandler(mainWindowProvider));
	ipcMain.handle(ValidChannel.STEAMWORKS_INITED, createSteamworksInitHandler(getSteamStatus, tryInitSteamworks));

	ipcMain.on(ValidChannel.OPEN_MOD_CONTEXT_MENU, (_event, record: ModData) => {
		Menu.buildFromTemplate(createContextMenuTemplate(record, mainWindowProvider)).popup();
	});
}
