import { shell, Menu } from 'electron';
import type { IpcMain, MenuItemConstructorOptions, WebContents } from 'electron';
import log from 'electron-log';
import type { SteamworksStatus } from 'shared/ipc';
import type { WorkshopDependencyRefreshResult } from 'shared/workshop-dependency-snapshot';

import { ModData, ModType, SessionMods, ValidChannel, createModUid, parseWorkshopModUid } from '../../model';
import { openExternalUrl } from '../external-links';
import { getModDetailsFromPath } from '../mod-fetcher';
import { scanModInventory } from '../mod-inventory-scan';
import { expandUserPath } from '../path-utils';
import Steamworks from '../steamworks';
import { refreshWorkshopMetadata, runSteamworksAction } from '../workshop-actions';
import { fetchWorkshopDependencySnapshot } from '../workshop-dependencies';
import { registerValidatedIpcHandler, registerValidatedIpcListener } from './ipc-handler';
import { parseModContextMenuPayload, parseReadModMetadataPayload, parseWorkshopIdPayload } from './mod-validation';

interface MainWindowProvider {
	getWebContents: () => WebContents | null;
}

type ScanModInventory = typeof scanModInventory;

export function createDownloadModHandler(steamworks = Steamworks, getSteamStatus?: () => SteamworksStatus) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.DOWNLOAD_MOD, workshopID);
		return runSteamworksAction(
			getSteamStatus?.(),
			`Failed to download mod ${validatedWorkshopID}`,
			(success, failure) => {
				steamworks.ugcDownloadItem(validatedWorkshopID, success, failure);
			},
			log
		);
	};
}

export function createSubscribeModHandler(steamworks = Steamworks, getSteamStatus?: () => SteamworksStatus) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.SUBSCRIBE_MOD, workshopID);
		return runSteamworksAction(
			getSteamStatus?.(),
			`Failed to subscribe to mod ${validatedWorkshopID}`,
			(success, failure) => {
				steamworks.ugcSubscribe(validatedWorkshopID, success, failure);
			},
			log
		);
	};
}

function createUnsubscribeModHandler(steamworks = Steamworks, getSteamStatus?: () => SteamworksStatus) {
	return async (_event: unknown, workshopID: bigint): Promise<boolean> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.UNSUBSCRIBE_MOD, workshopID);
		return runSteamworksAction(
			getSteamStatus?.(),
			`Failed to unsubscribe from mod ${validatedWorkshopID}`,
			(success, failure) => {
				steamworks.ugcUnsubscribe(validatedWorkshopID, success, failure);
			},
			log
		);
	};
}

export function createReadModMetadataHandler(scanInventory: ScanModInventory = scanModInventory) {
	return async (
		event: { sender: WebContents },
		localDir: string | undefined,
		allKnownMods: string[],
		options?: { treatNuterraSteamBetaAsEquivalent?: boolean }
	): Promise<SessionMods> => {
		const validatedPayload = parseReadModMetadataPayload(
			ValidChannel.READ_MOD_METADATA,
			localDir,
			allKnownMods,
			options?.treatNuterraSteamBetaAsEquivalent
		);
		const resolvedLocalDir = expandUserPath(validatedPayload.localDir) ?? undefined;

		const knownWorkshopMods: bigint[] = [];
		validatedPayload.allKnownMods.forEach((uid: string) => {
			log.debug(`Found known mod ${uid}`);
			const workshopID = parseWorkshopModUid(uid);
			if (workshopID !== null) {
				log.debug(`Found workshop mod ${workshopID.toString()}`);
				knownWorkshopMods.push(workshopID);
			}
		});

		try {
			const modsList = await scanInventory({
				knownWorkshopMods,
				localPath: resolvedLocalDir,
				progressSender: event.sender,
				treatNuterraSteamBetaAsEquivalent: validatedPayload.treatNuterraSteamBetaAsEquivalent
			});
			return new SessionMods(resolvedLocalDir, modsList);
		} catch (error) {
			log.error('Failed to get mod info:');
			log.error(error);
			throw error instanceof Error ? error : new Error(String(error));
		}
	};
}

function createSteamworksInitHandler(getSteamStatus: () => SteamworksStatus, tryInitSteamworks: () => SteamworksStatus) {
	return async (): Promise<SteamworksStatus> => {
		const status = getSteamStatus();
		if (status.inited) {
			return status;
		}
		return tryInitSteamworks();
	};
}

async function runContextMenuSteamworksAction(
	failureMessage: string,
	action: (success: (result?: unknown) => void, failure: (error: Error) => void) => void,
	onSuccess: () => void
): Promise<void> {
	const success = await runSteamworksAction(undefined, failureMessage, action as never, log);
	if (success) {
		onSuccess();
	}
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
		const workshopID = record.workshopID;
		template.push({
			label: 'Show in Steam',
			click: () => {
				openExternalUrl(`steam://url/CommunityFilePage/${workshopID}`);
			}
		});
		template.push({
			label: 'Show in Browser',
			click: () => {
				openExternalUrl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopID}`);
			}
		});
		template.push({ type: 'separator' });
		let metadataUpdateRequestId = 0;
		const getUpdatedInfo = async () => {
			const requestId = metadataUpdateRequestId + 1;
			metadataUpdateRequestId = requestId;
			const update = await refreshWorkshopMetadata(record, {
				loadModDetailsFromPath: getModDetailsFromPath,
				logger: log
			});
			if (requestId !== metadataUpdateRequestId) {
				return;
			}
			mainWindowProvider.getWebContents()?.send(ValidChannel.MOD_METADATA_UPDATE, createModUid(ModType.WORKSHOP, workshopID), update);
		};
		if (record.subscribed) {
			template.push({
				label: 'Unsubscribe',
				click: () => {
					void runContextMenuSteamworksAction(
						`Failed to unsubscribe from mod ${workshopID}`,
						(success, failure) => {
							Steamworks.ugcUnsubscribe(workshopID, success as never, failure);
						},
						() => {
							log.verbose(`Unsubscribed from ${workshopID}`);
							mainWindowProvider
								.getWebContents()
								?.send(ValidChannel.MOD_METADATA_UPDATE, createModUid(ModType.WORKSHOP, workshopID), { subscribed: false });
							void getUpdatedInfo();
						}
					);
				}
			});
		} else {
			template.push({
				label: 'Subscribe',
				click: () => {
					void runContextMenuSteamworksAction(
						`Failed to subscribe to mod ${workshopID}`,
						(success, failure) => {
							Steamworks.ugcSubscribe(workshopID, success as never, failure);
						},
						() => {
							log.verbose(`Subscribed to ${workshopID}`);
							mainWindowProvider
								.getWebContents()
								?.send(ValidChannel.MOD_METADATA_UPDATE, createModUid(ModType.WORKSHOP, workshopID), { subscribed: true });
							void getUpdatedInfo();
						}
					);
				}
			});
		}
		if (record.needsUpdate) {
			template.push({
				label: 'Update',
				click: () => {
					void runContextMenuSteamworksAction(
						`Failed to update mod ${record.workshopID}`,
						(success, failure) => {
							Steamworks.ugcDownloadItem(record.workshopID!, success as never, failure);
						},
						() => {
							log.verbose(`Updated ${record.workshopID}`);
							void getUpdatedInfo();
						}
					);
				}
			});
		}
	}
	return template;
}

export function createFetchWorkshopDependenciesHandler(
	mainWindowProvider: MainWindowProvider,
	workshopDependencySnapshot = fetchWorkshopDependencySnapshot
) {
	return async (_event: unknown, workshopID: bigint): Promise<WorkshopDependencyRefreshResult> => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, workshopID);
		const dependencySnapshot = await workshopDependencySnapshot(validatedWorkshopID);
		if (dependencySnapshot.status === 'failed') {
			return { status: 'failed' };
		}

		mainWindowProvider
			.getWebContents()
			?.send(
				ValidChannel.MOD_METADATA_UPDATE,
				createModUid(ModType.WORKSHOP, validatedWorkshopID),
				dependencySnapshot.status === 'updated' ? dependencySnapshot.snapshot : { steamDependenciesFetchedAt: dependencySnapshot.checkedAt }
			);

		return { status: dependencySnapshot.status };
	};
}

export function registerModHandlers(
	ipcMain: IpcMain,
	mainWindowProvider: MainWindowProvider,
	getSteamStatus: () => SteamworksStatus,
	tryInitSteamworks: () => SteamworksStatus
) {
	registerValidatedIpcListener(ipcMain, ValidChannel.OPEN_MOD_STEAM, (_event, workshopID: bigint) => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.OPEN_MOD_STEAM, workshopID);
		openExternalUrl(`steam://url/CommunityFilePage/${validatedWorkshopID}`);
	});

	registerValidatedIpcListener(ipcMain, ValidChannel.OPEN_MOD_BROWSER, (_event, workshopID: bigint) => {
		const validatedWorkshopID = parseWorkshopIdPayload(ValidChannel.OPEN_MOD_BROWSER, workshopID);
		openExternalUrl(`https://steamcommunity.com/sharedfiles/filedetails/?id=${validatedWorkshopID}`);
	});

	const subscribeMod = createSubscribeModHandler(Steamworks, getSteamStatus);
	registerValidatedIpcHandler(ipcMain, ValidChannel.SUBSCRIBE_MOD, async (event, workshopID: bigint) => {
		return subscribeMod(event, workshopID);
	});

	const unsubscribeMod = createUnsubscribeModHandler(Steamworks, getSteamStatus);
	registerValidatedIpcHandler(ipcMain, ValidChannel.UNSUBSCRIBE_MOD, async (event, workshopID: bigint) => {
		return unsubscribeMod(event, workshopID);
	});

	const downloadMod = createDownloadModHandler(Steamworks, getSteamStatus);
	registerValidatedIpcHandler(ipcMain, ValidChannel.DOWNLOAD_MOD, async (event, workshopID: bigint) => {
		return downloadMod(event, workshopID);
	});

	const readModMetadata = createReadModMetadataHandler();
	registerValidatedIpcHandler(
		ipcMain,
		ValidChannel.READ_MOD_METADATA,
		async (event, localDir: string | undefined, allKnownMods: string[], options?: { treatNuterraSteamBetaAsEquivalent?: boolean }) => {
			return readModMetadata(event, localDir, allKnownMods, options);
		}
	);

	const fetchWorkshopDependencies = createFetchWorkshopDependenciesHandler(mainWindowProvider);
	registerValidatedIpcHandler(ipcMain, ValidChannel.FETCH_WORKSHOP_DEPENDENCIES, async (event, workshopID: bigint) => {
		return fetchWorkshopDependencies(event, workshopID);
	});

	const steamworksInit = createSteamworksInitHandler(getSteamStatus, tryInitSteamworks);
	registerValidatedIpcHandler(ipcMain, ValidChannel.STEAMWORKS_INITED, async () => {
		return steamworksInit();
	});

	registerValidatedIpcListener(ipcMain, ValidChannel.OPEN_MOD_CONTEXT_MENU, (_event, record: ModData) => {
		const validatedRecord = parseModContextMenuPayload(ValidChannel.OPEN_MOD_CONTEXT_MENU, record);
		Menu.buildFromTemplate(createContextMenuTemplate(validatedRecord, mainWindowProvider)).popup();
	});
}
