import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';
import Steamworks from '../../main/steamworks';
import { UGCItemState } from '../../main/steamworks/types';
import { buildWorkshopMod, createModInventoryContext, fetchWorkshopMods, processSteamModResults } from '../../main/mod-fetcher';
import { ModType } from '../../model/Mod';
import { MAX_TTSMM_METADATA_BYTES, createLocalPotentialMod, scanLocalMods } from '../../main/mod-local-scan';
import { scanModInventory } from '../../main/mod-inventory-scan';
import { ModInventoryProgress } from '../../main/mod-inventory-progress';
import { collectMissingWorkshopDependencies } from '../../main/mod-workshop-dependencies';
import { hydrateWorkshopMod } from '../../main/mod-workshop-hydration';
import { resolveWorkshopDependencyChunk } from '../../main/mod-workshop-inventory';
import {
	chunkWorkshopIds,
	createWorkshopPotentialMod,
	getRawWorkshopDetailsForList,
	hasWorkshopModTag
} from '../../main/mod-workshop-metadata';
import { getSteamSubscribedPage, shouldSkipWorkshopFetch } from '../../main/mod-workshop-paging';
import { WorkshopMetadataLookupFailure, WorkshopPagingFailure } from '../../main/workshop-errors';
import { SteamPersonaCacheLive } from '../../main/steam-persona-cache';
import { createTempDir, createWorkshopDetails } from './test-utils';

function runWithSteamPersonaCache<A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> {
	return Effect.runPromise(effect.pipe(Effect.provide(SteamPersonaCacheLive as never)));
}

describe('ModFetcher', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('scans local mods through the local adapter', async () => {
		const tempDir = createTempDir('ttsmm-local-adapter-');
		const modDir = path.join(tempDir, 'AdapterPack');
		try {
			fs.mkdirSync(modDir, { recursive: true });
			fs.writeFileSync(path.join(modDir, 'AdapterBundle_bundle'), 'bundle');
			fs.writeFileSync(path.join(modDir, 'AdapterBundle_bundle preview.png'), 'preview');
			const progress = new ModInventoryProgress({ send: vi.fn() });

			await expect(Effect.runPromise(scanLocalMods(tempDir, progress))).resolves.toEqual([
				expect.objectContaining({
					uid: 'local:AdapterBundle',
					id: 'AdapterBundle',
					name: 'AdapterBundle',
					path: modDir,
					preview: expect.stringMatching(/^image:\/\/preview\//)
				})
			]);
			expect(createLocalPotentialMod(tempDir, 'AdapterPack')).toEqual(
				expect.objectContaining({
					uid: 'local:AdapterPack',
					path: modDir
				})
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('skips oversized ttsmm metadata while keeping valid local mod detection', async () => {
		const tempDir = createTempDir('ttsmm-local-metadata-limit-');
		const modDir = path.join(tempDir, 'OversizedMetadataPack');
		try {
			fs.mkdirSync(modDir, { recursive: true });
			fs.writeFileSync(path.join(modDir, 'OversizedBundle_bundle'), 'bundle');
			fs.writeFileSync(path.join(modDir, 'ttsmm.json'), Buffer.alloc(MAX_TTSMM_METADATA_BYTES + 1, 'x'));
			const progress = new ModInventoryProgress({ send: vi.fn() });

			await expect(Effect.runPromise(scanLocalMods(tempDir, progress))).resolves.toEqual([
				expect.objectContaining({
					uid: 'local:OversizedBundle',
					id: 'OversizedBundle',
					name: 'OversizedBundle',
					path: modDir
				})
			]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('scans inventory through the facade entrypoint', async () => {
		const tempDir = createTempDir('ttsmm-inventory-facade-');
		const modDir = path.join(tempDir, 'FacadePack');
		fs.mkdirSync(modDir);
		fs.writeFileSync(path.join(modDir, 'FacadeBundle_bundle'), '');
		const progressSender = { send: vi.fn() };
		vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
			props.success_callback({ items: [], totalItems: 0, numReturned: 0 });
			return true;
		});

		try {
			await expect(
				Effect.runPromise(
					scanModInventory({
						knownWorkshopMods: [],
						localPath: tempDir,
						platform: 'win32',
						progressSender
					})
				)
			).resolves.toEqual([expect.objectContaining({ uid: 'local:FacadeBundle' })]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('reports inventory progress through a shared progress tracker', async () => {
		const sender = { send: vi.fn() };
		const progress = new ModInventoryProgress(sender);
		progress.localMods = 1;
		progress.workshopMods = 1;

		progress.addLoaded(1);
		progress.finish();

		expect(sender.send).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(String), 0.5, 'Loading mod details');
		expect(sender.send).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(String), 1, 'Finished loading mods');
	});

	it('keeps workshop metadata helpers behind the metadata adapter', () => {
		expect(chunkWorkshopIds([BigInt(1), BigInt(2)])).toEqual([[BigInt(1), BigInt(2)]]);
		expect(createWorkshopPotentialMod(BigInt(42))).toEqual(
			expect.objectContaining({
				name: 'Workshop item 42',
				type: 'workshop',
				uid: 'workshop:42',
				workshopID: BigInt(42)
			})
		);
		expect(hasWorkshopModTag(['Blocks', 'Mods'])).toBe(true);
		expect(hasWorkshopModTag(['Screenshots'])).toBe(false);
	});

	it('reports Steamworks detail lookup failures as typed recoverable failures', async () => {
		const cause = new Error('Steamworks unavailable');
		vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((_workshopIDs, _successCallback, errorCallback) => {
			errorCallback?.(cause);
		});

		await expect(Effect.runPromise(getRawWorkshopDetailsForList([BigInt(42), BigInt(77)]))).rejects.toMatchObject({
			_tag: 'WorkshopMetadataLookupFailure',
			workshopIDs: [BigInt(42), BigInt(77)],
			cause
		} satisfies Partial<WorkshopMetadataLookupFailure>);
	});

	it('reports Steamworks subscription page failures as typed recoverable failures', async () => {
		const cause = new Error('Steamworks page unavailable');
		vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
			props.error_callback(cause);
			return true;
		});

		await expect(Effect.runPromise(getSteamSubscribedPage(3))).rejects.toMatchObject({
			_tag: 'WorkshopPagingFailure',
			pageNum: 3,
			cause
		} satisfies Partial<WorkshopPagingFailure>);
	});

	it('hydrates uninstalled workshop metadata behind the hydration module', async () => {
		const workshopID = BigInt(42);
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
		vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
		vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Steam Author');
		vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);
		const onProgress = vi.fn();

		await expect(
			runWithSteamPersonaCache(
				hydrateWorkshopMod({
					onProgress,
					steamUGCDetails: createWorkshopDetails({
						publishedFileId: workshopID,
						title: 'Steam Workshop Title',
						description: 'Steam description',
						tags: ['Mods'],
						tagsDisplayNames: ['Mods']
					}),
					workshopID
				})
			)
		).resolves.toEqual(
			expect.objectContaining({
				uid: `workshop:${workshopID}`,
				workshopID,
				name: 'Steam Workshop Title',
				description: 'Steam description',
				subscribed: true,
				authors: ['Steam Author']
			})
		);
		expect(onProgress).toHaveBeenCalledWith(1);
	});

	it('keeps missing Steamworks children as unknown dependency metadata', async () => {
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
		vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
		vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Steam Author');
		vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);
		const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'win32');

		await expect(
			runWithSteamPersonaCache(
				processSteamModResults(context, [
					createWorkshopDetails({
						publishedFileId: BigInt(77),
						title: 'Unknown Dependencies',
						tags: ['Mods'],
						tagsDisplayNames: ['Mods'],
						children: undefined
					})
				])
			)
		).resolves.toEqual([
			expect.objectContaining({
				steamDependencies: undefined,
				steamDependencyNames: undefined,
				steamDependenciesFetchedAt: expect.any(Number)
			})
		]);
	});

	it('resolves workshop dependency names through Steamworks child details', async () => {
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
		vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
		vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Steam Author');
		vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);
		vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((workshopIDs, success) => {
			success(
				workshopIDs.map((workshopID) =>
					createWorkshopDetails({
						publishedFileId: BigInt(workshopID),
						title: `Dependency ${workshopID}`
					})
				)
			);
		});
		const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'win32');

		await expect(
			runWithSteamPersonaCache(
				processSteamModResults(context, [
					createWorkshopDetails({
						publishedFileId: BigInt(77),
						title: 'Parent',
						tags: ['Mods'],
						tagsDisplayNames: ['Mods'],
						children: [BigInt(11)]
					})
				])
			)
		).resolves.toEqual([
			expect.objectContaining({
				steamDependencies: [BigInt(11)],
				steamDependencyNames: {
					'11': 'Dependency 11'
				},
				steamDependenciesFetchedAt: expect.any(Number)
			})
		]);
	});

	it('resolves dependency names for top-level subscribed workshop items', async () => {
		vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
			props.success_callback(
				props.options?.page_num === 1
					? {
							items: [
								createWorkshopDetails({
									publishedFileId: BigInt(77),
									title: 'Parent',
									tags: ['Mods'],
									tagsDisplayNames: ['Mods'],
									children: [BigInt(11)]
								})
							],
							totalItems: 1,
							numReturned: 1
						}
					: {
							items: [],
							totalItems: 1,
							numReturned: 0
						}
			);
		});
		vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((workshopIDs, success) => {
			success(
				workshopIDs.map((workshopID) =>
					createWorkshopDetails({
						publishedFileId: BigInt(workshopID),
						title: `Dependency ${workshopID}`
					})
				)
			);
		});
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
		vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
		vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Steam Author');
		vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);
		vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
		const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'win32');

		await expect(runWithSteamPersonaCache(fetchWorkshopMods(context))).resolves.toEqual([
			expect.objectContaining({
				workshopID: BigInt(77),
				steamDependencies: [BigInt(11)],
				steamDependencyNames: {
					'11': 'Dependency 11'
				},
				steamDependenciesFetchedAt: expect.any(Number)
			})
		]);
	});

	it('keeps the workshop platform guard behind the paging adapter', () => {
		expect(shouldSkipWorkshopFetch('win32')).toBe(false);
		vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(false);
		vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');

		expect(shouldSkipWorkshopFetch('linux')).toBe(true);
	});

	it('collects missing workshop dependencies without re-adding loaded or invalid mods', () => {
		const loadedDependency = BigInt(2);
		const invalidDependency = BigInt(3);
		const missingDependency = BigInt(4);
		const workshopMap = new Map<bigint, { uid: string }>([[loadedDependency, { uid: 'workshop:2' }]]);
		const knownInvalidMods = new Set([invalidDependency]);

		expect(
			collectMissingWorkshopDependencies(
				[
					{
						uid: 'workshop:1',
						id: null,
						type: ModType.WORKSHOP,
						hasCode: false,
						steamDependencies: [loadedDependency, invalidDependency, missingDependency]
					}
				],
				workshopMap as never,
				knownInvalidMods
			)
		).toEqual(new Set([missingDependency]));
	});

	it('does not re-add NuterraSteam Beta as a missing workshop dependency when compatibility is enabled', () => {
		const stableNuterraWorkshopID = BigInt(2484820102);
		const betaNuterraWorkshopID = BigInt(2790966966);
		const workshopMap = new Map<bigint, { uid: string; id: string; name: string }>([
			[
				stableNuterraWorkshopID,
				{
					uid: `workshop:${stableNuterraWorkshopID}`,
					id: 'NuterraSteam',
					name: 'NuterraSteam'
				}
			]
		]);

		expect(
			collectMissingWorkshopDependencies(
				[
					{
						uid: 'workshop:1',
						id: 'NeedsNuterra',
						type: ModType.WORKSHOP,
						hasCode: false,
						steamDependencies: [betaNuterraWorkshopID]
					}
				],
				workshopMap as never,
				new Set(),
				{ treatNuterraSteamBetaAsEquivalent: true }
			)
		).toEqual(new Set());
	});

	it('uses the shared NuterraSteam variant policy when loaded workshop metadata only has a beta name', () => {
		const loadedWorkshopID = BigInt(123);
		const betaNuterraWorkshopID = BigInt(2790966966);
		const workshopMap = new Map<bigint, { uid: string; id: string | null; name: string }>([
			[
				loadedWorkshopID,
				{
					uid: `workshop:${loadedWorkshopID}`,
					id: null,
					name: 'NuterraSteam (Beta)'
				}
			]
		]);

		expect(
			collectMissingWorkshopDependencies(
				[
					{
						uid: 'workshop:1',
						id: 'NeedsNuterra',
						type: ModType.WORKSHOP,
						hasCode: false,
						steamDependencies: [betaNuterraWorkshopID]
					}
				],
				workshopMap as never,
				new Set(),
				{ treatNuterraSteamBetaAsEquivalent: true }
			)
		).toEqual(new Set());
	});

	it('uses Workshop dependency names for NuterraSteam expansion when the raw Workshop id is unknown', () => {
		const stableNuterraWorkshopID = BigInt(2484820102);
		const renamedBetaDependencyID = BigInt(999999999);
		const workshopMap = new Map<bigint, { uid: string; id: string; name: string }>([
			[
				stableNuterraWorkshopID,
				{
					uid: `workshop:${stableNuterraWorkshopID}`,
					id: 'NuterraSteam',
					name: 'NuterraSteam'
				}
			]
		]);
		const parentMod = {
			uid: 'workshop:1',
			id: 'NeedsNuterra',
			type: ModType.WORKSHOP,
			hasCode: false,
			steamDependencies: [renamedBetaDependencyID],
			steamDependencyNames: {
				[renamedBetaDependencyID.toString()]: 'NuterraSteam (Beta)'
			}
		};

		expect(
			collectMissingWorkshopDependencies([parentMod], workshopMap as never, new Set(), {
				treatNuterraSteamBetaAsEquivalent: true
			})
		).toEqual(new Set());
		expect(
			collectMissingWorkshopDependencies([parentMod], workshopMap as never, new Set(), {
				treatNuterraSteamBetaAsEquivalent: false
			})
		).toEqual(new Set([renamedBetaDependencyID]));
	});

	it('re-adds NuterraSteam Beta as a missing workshop dependency when compatibility is disabled', () => {
		const stableNuterraWorkshopID = BigInt(2484820102);
		const betaNuterraWorkshopID = BigInt(2790966966);
		const workshopMap = new Map<bigint, { uid: string; id: string; name: string }>([
			[
				stableNuterraWorkshopID,
				{
					uid: `workshop:${stableNuterraWorkshopID}`,
					id: 'NuterraSteam',
					name: 'NuterraSteam'
				}
			]
		]);

		expect(
			collectMissingWorkshopDependencies(
				[
					{
						uid: 'workshop:1',
						id: 'NeedsNuterra',
						type: ModType.WORKSHOP,
						hasCode: false,
						steamDependencies: [betaNuterraWorkshopID]
					}
				],
				workshopMap as never,
				new Set(),
				{ treatNuterraSteamBetaAsEquivalent: false }
			)
		).toEqual(new Set([betaNuterraWorkshopID]));
	});

	it('expands known workshop chunks through the Workshop inventory module', async () => {
		const parentWorkshopID = BigInt(10);
		const childWorkshopID = BigInt(11);
		const knownWorkshopMods = new Set([parentWorkshopID]);
		const workshopMap = new Map<bigint, { uid: string }>();
		const getDetailsForWorkshopModList = vi.fn(() =>
			Effect.succeed([
				{
					uid: `workshop:${parentWorkshopID}`,
					id: null,
					type: ModType.WORKSHOP,
					hasCode: false,
					workshopID: parentWorkshopID,
					steamDependencies: [childWorkshopID]
				}
			])
		);

		await expect(
			Effect.runPromise(
				resolveWorkshopDependencyChunk(workshopMap as never, new Set(), new Set([parentWorkshopID]), {
					getDetailsForWorkshopModList,
					knownWorkshopMods,
					updateModLoadingProgress: vi.fn()
				})
			)
		).resolves.toEqual(new Set([childWorkshopID]));

		expect(knownWorkshopMods).toEqual(new Set());
		expect(workshopMap.get(parentWorkshopID)).toEqual(expect.objectContaining({ uid: `workshop:${parentWorkshopID}` }));
	});

	it('skips Linux workshop scans when TerraTech is not installed in Steam', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(false);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue('');
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([BigInt(1)]);
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('workshop scan should have been skipped');
		});
		const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'linux');

		await expect(runWithSteamPersonaCache(fetchWorkshopMods(context))).resolves.toEqual([]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).not.toHaveBeenCalled();
		expect(ugcGetUserItems).not.toHaveBeenCalled();
	});

	it('uses subscribed items instead of user item queries for empty Linux workshop scans', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
		const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation(() => {
			throw new Error('linux workshop scans should not query workshop details when there are no subscribed items');
		});
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('linux workshop scans should not query user items');
		});
		const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'linux');

		await expect(runWithSteamPersonaCache(fetchWorkshopMods(context))).resolves.toEqual([]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).toHaveBeenCalledTimes(1);
		expect(getUGCDetails).not.toHaveBeenCalled();
		expect(ugcGetUserItems).not.toHaveBeenCalled();
	});

	it('filters non-mod subscribed workshop items on Linux while enriching valid mods from Steam metadata', async () => {
		const tempDir = createTempDir('ttsmm-linux-workshop-');
		const validWorkshopID = BigInt(123);
		const invalidWorkshopID = BigInt(456);
		const validModDir = path.join(tempDir, validWorkshopID.toString());
		try {
			fs.mkdirSync(validModDir, { recursive: true });
			fs.writeFileSync(path.join(validModDir, 'GreenTech_bundle'), 'bundle');

			vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
			vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
			const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([validWorkshopID, invalidWorkshopID]);
			const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((ids, successCallback) => {
				if (ids.length === 1 && ids[0] === '789') {
					successCallback([
						createWorkshopDetails({
							publishedFileId: BigInt(789),
							title: 'Dependency 789'
						})
					]);
					return;
				}

				expect(ids).toEqual([validWorkshopID.toString(), invalidWorkshopID.toString()]);
				successCallback([
					createWorkshopDetails({
						publishedFileId: validWorkshopID,
						title: 'Green Tech Expansion',
						description: 'A valid TerraTech mod',
						tags: ['Mods', 'Blocks'],
						tagsDisplayNames: ['Mods', 'Blocks'],
						children: [BigInt(789)],
						previewURL: 'preview://valid'
					}),
					createWorkshopDetails({
						publishedFileId: invalidWorkshopID,
						title: 'Tech Snapshot',
						description: 'Not a mod',
						tags: ['Screenshots'],
						tagsDisplayNames: ['Screenshots']
					})
				]);
			});
			const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
				throw new Error('linux workshop scans should not query user items');
			});
			vi.spyOn(Steamworks, 'ugcGetItemState').mockImplementation((workshopID) => {
				if (workshopID === validWorkshopID) {
					return UGCItemState.Subscribed | UGCItemState.Installed;
				}
				if (workshopID === invalidWorkshopID) {
					return UGCItemState.Subscribed;
				}
				return UGCItemState.None;
			});
			vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockImplementation((workshopID) => {
				if (workshopID === validWorkshopID) {
					return {
						folder: validModDir,
						sizeOnDisk: '2048',
						timestamp: 1710000000
					};
				}
				return undefined;
			});
			vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
			vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Test Author');
			vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);

			const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'linux');

			await expect(runWithSteamPersonaCache(fetchWorkshopMods(context))).resolves.toEqual([
				expect.objectContaining({
					uid: `workshop:${validWorkshopID}`,
					workshopID: validWorkshopID,
					name: 'Green Tech Expansion',
					id: 'GreenTech',
					tags: ['Mods', 'Blocks'],
					steamDependencies: [BigInt(789)],
					steamDependencyNames: {
						'789': 'Dependency 789'
					},
					authors: ['Test Author']
				})
			]);

			expect(getSubscribedItems).toHaveBeenCalledTimes(1);
			expect(getUGCDetails).toHaveBeenCalledTimes(2);
			expect(ugcGetUserItems).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps explicitly referenced Linux workshop ids visible when Steam metadata is unavailable', async () => {
		const explicitWorkshopID = BigInt(789);

		vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([]);
		vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((_ids, _successCallback, errorCallback) => {
			errorCallback?.(new Error('metadata unavailable'));
		});
		vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.None);
		vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);

		const context = createModInventoryContext({ send: vi.fn() }, undefined, [explicitWorkshopID], 'linux');

		await expect(runWithSteamPersonaCache(fetchWorkshopMods(context))).resolves.toEqual([
			expect.objectContaining({
				uid: `workshop:${explicitWorkshopID}`,
				workshopID: explicitWorkshopID,
				name: `Workshop item ${explicitWorkshopID.toString()}`,
				id: null
			})
		]);
	});

	it('hydrates Linux workshop mods from subscribed item details', async () => {
		const isAppInstalled = vi.spyOn(Steamworks, 'isAppInstalled').mockReturnValue(true);
		const getAppInstallDir = vi.spyOn(Steamworks, 'getAppInstallDir').mockReturnValue(process.cwd());
		const getSubscribedItems = vi.spyOn(Steamworks, 'getSubscribedItems').mockReturnValue([BigInt(42)]);
		const getUGCDetails = vi.spyOn(Steamworks, 'getUGCDetails').mockImplementation((workshopIDs, successCallback) => {
			expect(workshopIDs).toEqual(['42']);
			successCallback([
				{
					acceptForUse: true,
					banned: false,
					tagsTruncated: false,
					fileType: 0,
					result: 1,
					visibility: 0,
					score: 0,
					file: '',
					fileName: '',
					fileSize: 1234,
					previewURL: 'https://example.com/preview.png',
					previewFile: '',
					previewFileSize: 0,
					steamIDOwner: '123',
					consumerAppID: 285920,
					creatorAppID: 285920,
					publishedFileId: BigInt(42),
					title: 'Workshop Title',
					description: 'Workshop Description',
					URL: '',
					timeAddedToUserList: 1,
					timeCreated: 2,
					timeUpdated: 3,
					votesDown: 0,
					votesUp: 0,
					children: [],
					metadata: '',
					tags: ['Mods'],
					tagsDisplayNames: ['Mods']
				}
			]);
		});
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation(() => {
			throw new Error('linux workshop scans should not query user items');
		});
		const ugcGetItemState = vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(0);
		const ugcGetItemInstallInfo = vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue(undefined);
		vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
		const getFriendPersonaName = vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Author One');
		const requestUserInformation = vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);
		const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'linux');

		await expect(runWithSteamPersonaCache(fetchWorkshopMods(context))).resolves.toMatchObject([
			{
				workshopID: BigInt(42),
				name: 'Workshop Title',
				description: 'Workshop Description',
				authors: ['Author One'],
				tags: ['Mods']
			}
		]);

		expect(isAppInstalled).toHaveBeenCalledWith(285920);
		expect(getAppInstallDir).toHaveBeenCalledWith(285920);
		expect(getSubscribedItems).toHaveBeenCalledTimes(1);
		expect(getUGCDetails).toHaveBeenCalledTimes(1);
		expect(ugcGetUserItems).not.toHaveBeenCalled();
		expect(ugcGetItemState).toHaveBeenCalledWith(BigInt(42));
		expect(ugcGetItemInstallInfo).toHaveBeenCalledWith(BigInt(42));
		expect(getFriendPersonaName).toHaveBeenCalledWith('123');
		expect(requestUserInformation).not.toHaveBeenCalled();
	});

	it('only applies safe ttsmm metadata fields without overriding workshop identity or Steam metadata', async () => {
		const tempDir = createTempDir('ttsmm-sanitized-workshop-');
		const workshopID = BigInt(321);
		const workshopDir = path.join(tempDir, workshopID.toString());
		try {
			fs.mkdirSync(workshopDir, { recursive: true });
			fs.writeFileSync(path.join(workshopDir, 'CoreBundle_bundle'), 'bundle');
			fs.writeFileSync(
				path.join(workshopDir, 'ttsmm.json'),
				JSON.stringify({
					uid: 'local:overridden',
					type: 'local',
					workshopID: '999999',
					path: 'C:\\malicious',
					subscribed: false,
					name: 'Local Override Name',
					description: 'Local description',
					authors: ['Local Author'],
					tags: ['LocalTag'],
					explicitIDDependencies: ['MissingDependency']
				})
			);

			vi.spyOn(Steamworks, 'ugcGetItemState').mockReturnValue(UGCItemState.Subscribed | UGCItemState.Installed);
			vi.spyOn(Steamworks, 'ugcGetItemInstallInfo').mockReturnValue({
				folder: workshopDir,
				sizeOnDisk: '2048',
				timestamp: 1710000000
			});
			vi.spyOn(Steamworks, 'on').mockImplementation(() => undefined);
			vi.spyOn(Steamworks, 'getFriendPersonaName').mockReturnValue('Steam Author');
			vi.spyOn(Steamworks, 'requestUserInformation').mockReturnValue(false);

			const context = createModInventoryContext({ send: vi.fn() }, undefined, [], 'win32');
			const mod = await runWithSteamPersonaCache(
				buildWorkshopMod(
					context,
					workshopID,
					createWorkshopDetails({
						publishedFileId: workshopID,
						title: 'Steam Workshop Title',
						description: 'Steam description',
						tags: ['Mods', 'Blocks'],
						tagsDisplayNames: ['Mods', 'Blocks']
					})
				)
			);

			expect(mod).toEqual(
				expect.objectContaining({
					uid: `workshop:${workshopID}`,
					type: 'workshop',
					workshopID,
					path: workshopDir,
					subscribed: true,
					name: 'Steam Workshop Title',
					description: 'Steam description',
					authors: ['Steam Author'],
					tags: ['Mods', 'Blocks'],
					explicitIDDependencies: ['MissingDependency'],
					id: 'CoreBundle'
				})
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
