import { shell, Menu } from 'electron';
import type { IpcMain, MenuItemConstructorOptions, WebContents } from 'electron';
import log from 'electron-log';

import { ModData, ModType, SessionMods, cloneModData, ValidChannel } from '../../model';
import { openExternalUrl } from '../external-links';
import { getModDetailsFromPath } from '../mod-fetcher';
import { scanModInventory } from '../mod-inventory-scan';
import { expandUserPath } from '../path-utils';
import Steamworks, { EResult, UGCItemState } from '../steamworks';
import { clearWorkshopDependencyLookupCache, fetchWorkshopDependencyLookup } from '../workshop-dependencies';
import { assertValidIpcSender } from './ipc-sender-validation';
import { parseModContextMenuPayload, parseReadModMetadataPayload, parseWorkshopIdPayload } from './mod-validation';

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
		try {
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
		} catch (error) {
			log.error(failureMessage);
			log.error(error);
			resolve(false);
		}
	});
}

export function createDownloadModHandler(steamworks = Steamworks) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.DOWNLOAD_MOD, workshopID);
		return createSteamResultHandler(`Failed to download mod ${validatedWorkshopID}`, (success, failure) => {
			steamworks.ugcDownloadItem(validatedWorkshopID, success, failure);
		});
	};
}

export function createSubscribeModHandler(steamworks = Steamworks) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.SUBSCRIBE_MOD, workshopID);
		return createSteamResultHandler(`Failed to subscribe to mod ${validatedWorkshopID}`, (success, failure) => {
			steamworks.ugcSubscribe(validatedWorkshopID, success, failure);
		});
	};
}

function createUnsubscribeModHandler(steamworks = Steamworks) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.UNSUBSCRIBE_MOD, workshopID);
		return createSteamResultHandler(`Failed to unsubscribe from mod ${validatedWorkshopID}`, (success, failure) => {
			steamworks.ugcUnsubscribe(validatedWorkshopID, success, failure);
		});
	};
}

export function createReadModMetadataHandler(clearDependencyLookupCache = clearWorkshopDependencyLookupCache) {
	return async (event: { sender: WebContents }, localDir: string | undefined, allKnownMods: string[]): Promise<SessionMods> => {
		const validatedPayload = parseReadModMetadataPayload(ValidChannel.READ_MOD_METADATA, localDir, allKnownMods);
		clearDependencyLookupCache();
		const resolvedLocalDir = expandUserPath(validatedPayload.localDir) ?? undefined;

		const knownWorkshopMods: bigint[] = [];
		validatedPayload.allKnownMods.forEach((uid: string) => {
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

		try {
			const modsList = await scanModInventory({
				knownWorkshopMods,
				localPath: resolvedLocalDir,
				progressSender: event.sender
			});
			return new SessionMods(resolvedLocalDir, modsList);
		} catch (error) {
			log.error('Failed to get mod info:');
			log.error(error);
			throw error instanceof Error ? error : new Error(String(error));
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

export function createContextMenuTemplate(record: ModData, mainWindowProvider: MainWindowProvider): MenuItemConstructorOptions[] {
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
			const update = cloneModData(record);
			try {
				const state: UGCItemState = Steamworks.ugcGetItemState(record.workshopID!);
				update.subscribed = !!(state & UGCItemState.Subscribed);
				update.installed = !!(state & UGCItemState.Installed);
				update.downloadPending = !!(state & UGCItemState.DownloadPending);
				update.downloading = !!(state & UGCItemState.Downloading);
				update.needsUpdate = !!(state & UGCItemState.NeedsUpdate);
				const installInfo = Steamworks.ugcGetItemInstallInfo(record.workshopID!);
				if (installInfo) {
					log.verbose(`Workshop mod is installed at path: ${installInfo.folder}`);
					update.lastUpdate = new Date(installInfo.timestamp * 1000);
					update.size = parseInt(installInfo.sizeOnDisk, 10);
					update.path = installInfo.folder;

					await getModDetailsFromPath(update, installInfo.folder, record.type);
				} else {
					log.verbose(`FAILED to get install info for mod ${record.workshopID}`);
					update.lastUpdate = undefined;
					update.path = undefined;
				}
			} catch (error) {
				log.error(`Failed to refresh workshop metadata for ${record.workshopID}`);
				log.error(error);
			}
			if (requestId !== metadataUpdateRequestId) {
				return;
			}
			mainWindowProvider.getWebContents()?.send(ValidChannel.MOD_METADATA_UPDATE, `${ModType.WORKSHOP}:${record.workshopID}`, update);
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
						void getUpdatedInfo();
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
						void getUpdatedInfo();
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
						void getUpdatedInfo();
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
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, workshopID);
		const dependencyLookup = await workshopDependencyLookup(validatedWorkshopID);
		if (!dependencyLookup) {
			return false;
		}

		mainWindowProvider
			.getWebContents()
			?.send(ValidChannel.MOD_METADATA_UPDATE, `${ModType.WORKSHOP}:${validatedWorkshopID}`, dependencyLookup);

		return true;
	};
}

export function registerModHandlers(
	ipcMain: IpcMain,
	mainWindowProvider: MainWindowProvider,
	getSteamStatus: () => SteamStatus,
	tryInitSteamworks: () => SteamStatus
) {
	ipcMain.on(ValidChannel.OPEN_MOD_STEAM, (event, workshopID: bigint) => {
		assertValidIpcSender(ValidChannel.OPEN_MOD_STEAM, event);
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.OPEN_MOD_STEAM, workshopID);
		openExternalUrl(`steam://url/CommunityFilePage/${validatedWorkshopID}`);
	});

	ipcMain.on(ValidChannel.OPEN_MOD_BROWSER, (event, workshopID: bigint) => {
		assertValidIpcSender(ValidChannel.OPEN_MOD_BROWSER, event);
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.OPEN_MOD_BROWSER, workshopID);
		openExternalUrl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${validatedWorkshopID}`);
	});

	const subscribeMod = createSubscribeModHandler();
	ipcMain.handle(ValidChannel.SUBSCRIBE_MOD, async (event, workshopID: bigint) => {
		assertValidIpcSender(ValidChannel.SUBSCRIBE_MOD, event);
		return subscribeMod(event, workshopID);
	});

	const unsubscribeMod = createUnsubscribeModHandler();
	ipcMain.handle(ValidChannel.UNSUBSCRIBE_MOD, async (event, workshopID: bigint) => {
		assertValidIpcSender(ValidChannel.UNSUBSCRIBE_MOD, event);
		return unsubscribeMod(event, workshopID);
	});

	const downloadMod = createDownloadModHandler();
	ipcMain.handle(ValidChannel.DOWNLOAD_MOD, async (event, workshopID: bigint) => {
		assertValidIpcSender(ValidChannel.DOWNLOAD_MOD, event);
		return downloadMod(event, workshopID);
	});

	const readModMetadata = createReadModMetadataHandler();
	ipcMain.handle(ValidChannel.READ_MOD_METADATA, async (event, localDir: string | undefined, allKnownMods: string[]) => {
		assertValidIpcSender(ValidChannel.READ_MOD_METADATA, event);
		return readModMetadata(event, localDir, allKnownMods);
	});

	const fetchWorkshopDependencies = createFetchWorkshopDependenciesHandler(mainWindowProvider);
	ipcMain.handle(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, async (event, workshopID: bigint) => {
		assertValidIpcSender(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, event);
		return fetchWorkshopDependencies(event, workshopID);
	});

	const steamworksInit = createSteamworksInitHandler(getSteamStatus, tryInitSteamworks);
	ipcMain.handle(ValidChannel.STEAMWORKS_INITED, async (event) => {
		assertValidIpcSender(ValidChannel.STEAMWORKS_INITED, event);
		return steamworksInit();
	});

	ipcMain.on(ValidChannel.OPEN_MOD_CONTEXT_MENU, (event, record: ModData) => {
		assertValidIpcSender(ValidChannel.OPEN_MOD_CONTEXT_MENU, event);
		const validatedRecord = parseModContextMenuPayload(ValidChannel.OPEN_MOD_CONTEXT_MENU, record);
		Menu.buildFromTemplate(createContextMenuTemplate(validatedRecord, mainWindowProvider)).popup();
	});
}
