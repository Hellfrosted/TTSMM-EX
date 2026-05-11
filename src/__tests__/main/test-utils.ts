import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, vi } from 'vitest';
import { updateCollectionFile } from '../../main/collection-store';
import Steamworks from '../../main/steamworks';
import { type SteamUGCDetails, UGCItemVisibility } from '../../main/steamworks/types';
import { resolveHtmlPath } from '../../main/util';
import type { AppConfig, ModCollection } from '../../model';
import type { BlockLookupRecord } from '../../shared/block-lookup';

const tempDirs = new Set<string>();

export function createTempDir(prefix: string) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.add(tempDir);
	return tempDir;
}

afterEach(() => {
	for (const tempDir of tempDirs) {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
	tempDirs.clear();
});

export function createValidIpcEvent() {
	return {
		senderFrame: {
			url: resolveHtmlPath('index.html')
		}
	};
}

export function createTestAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
	return {
		closeOnLaunch: false,
		language: 'english',
		gameExec: '',
		workshopID: BigInt(0),
		logsDir: '',
		activeCollection: 'default',
		steamMaxConcurrency: 5,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map(),
		...overrides
	};
}

export function writeTestCollection(userDataPath: string, collection: ModCollection) {
	if (!updateCollectionFile(userDataPath, collection)) {
		throw new Error(`Failed to write test collection ${collection.name}`);
	}
}

export function mockSteamworksBlockLookupInstallState() {
	vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
	vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
	vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
}

export function createTestBlockLookupRecord(overrides: Partial<BlockLookupRecord> = {}): BlockLookupRecord {
	const blockName = overrides.blockName ?? 'Alpha Cannon';
	const modTitle = overrides.modTitle ?? 'Test Blocks';
	const sourcePath = overrides.sourcePath ?? path.normalize('/mods/TestCannon.json');
	const preferredAlias = overrides.preferredAlias ?? `${blockName.replace(/\s/g, '_')}(${modTitle.replace(/\s/g, '_')})`;

	return {
		blockId: overrides.blockId ?? '42',
		blockName,
		fallbackAlias: overrides.fallbackAlias ?? preferredAlias,
		fallbackSpawnCommand: overrides.fallbackSpawnCommand ?? `SpawnBlock ${preferredAlias}`,
		internalName: overrides.internalName ?? blockName.replace(/\s/g, ''),
		modTitle,
		preferredAlias,
		previewBounds: overrides.previewBounds,
		previewAssetNames: overrides.previewAssetNames,
		renderedPreview: overrides.renderedPreview,
		sourceKind: overrides.sourceKind ?? 'json',
		sourcePath,
		spawnCommand: overrides.spawnCommand ?? `SpawnBlock ${preferredAlias}`,
		workshopId: overrides.workshopId ?? '12345'
	};
}

export function createIpcHandlerHarness(registerHandlers: (ipcMain: never) => void) {
	const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
	const ipcMain = {
		handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
			handlers.set(channel, handler);
		}),
		on: vi.fn()
	};

	registerHandlers(ipcMain as never);

	const invokeWithEvent = <T>(channel: string, event: unknown, ...args: unknown[]) => {
		const handler = handlers.get(channel);
		if (!handler) {
			throw new Error(`Missing handler for ${channel}`);
		}
		return handler(event, ...args) as Promise<T>;
	};

	const invoke = <T>(channel: string, ...args: unknown[]) => invokeWithEvent<T>(channel, createValidIpcEvent(), ...args);

	return { handlers, invoke, invokeWithEvent, ipcMain };
}

export function createWorkshopDetails(
	overrides: Partial<SteamUGCDetails> & Pick<SteamUGCDetails, 'publishedFileId' | 'title'>
): SteamUGCDetails {
	return {
		acceptForUse: true,
		banned: false,
		tagsTruncated: false,
		fileType: 0,
		result: 1,
		visibility: UGCItemVisibility.Public,
		score: 1,
		file: '',
		fileName: '',
		fileSize: 1024,
		previewURL: '',
		previewFile: '',
		previewFileSize: 0,
		steamIDOwner: 'owner-1',
		consumerAppID: 285920,
		creatorAppID: 285920,
		description: '',
		URL: '',
		timeAddedToUserList: 0,
		timeCreated: 0,
		timeUpdated: 0,
		votesDown: 0,
		votesUp: 0,
		metadata: '',
		tags: [],
		tagsDisplayNames: [],
		children: [],
		...overrides
	};
}
