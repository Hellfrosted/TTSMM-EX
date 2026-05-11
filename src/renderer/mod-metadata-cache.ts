import { Effect } from 'effect';
import * as AtomRef from 'effect/unstable/reactivity/AtomRef';
import { type AppConfig, hydrateSessionMods } from 'model';
import { createModManagerUid, type ModDataOverride } from 'model/Mod';
import type { ModCollection } from 'model/ModCollection';
import { RendererElectron, runRenderer } from './runtime';

type ModMetadataCacheData = ReturnType<typeof hydrateSessionMods>;

interface ModMetadataQueryOptionsInput {
	localDir: string | undefined;
	scanRequest: ModMetadataScanRequest;
	forceReload: boolean;
	attempt: number;
	userOverrides: Map<string, ModDataOverride>;
	treatNuterraSteamBetaAsEquivalent: boolean;
}

interface ModMetadataScanRequestInput {
	allCollections: Map<string, ModCollection>;
	workshopID: AppConfig['workshopID'];
	forceReload: boolean;
	userOverrides: Map<string, ModDataOverride>;
}

export interface ModMetadataScanRequest {
	knownModIds: readonly string[];
	userOverridesKey: readonly unknown[];
	metadataScanKey: string;
}

const modMetadataCacheRef = AtomRef.make<Map<string, ModMetadataCacheData>>(new Map());

function getKnownModIds(allCollections: Map<string, ModCollection>, workshopID: AppConfig['workshopID'], forceReload: boolean) {
	const knownMods = forceReload
		? new Set<string>()
		: new Set([...allCollections.values()].map((value: ModCollection) => value.mods).flat());
	knownMods.add(createModManagerUid(workshopID));
	return Array.from(knownMods).sort();
}

function getUserOverridesQueryKey(userOverrides: Map<string, ModDataOverride>) {
	return Array.from(userOverrides.entries())
		.sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
		.map(([uid, override]) => [uid, override.id ?? null, override.tags ? Array.from(override.tags).sort() : []]);
}

export function createModMetadataScanRequest({
	allCollections,
	workshopID,
	forceReload,
	userOverrides
}: ModMetadataScanRequestInput): ModMetadataScanRequest {
	const knownModIds = getKnownModIds(allCollections, workshopID, forceReload);
	const userOverridesKey = getUserOverridesQueryKey(userOverrides);

	return {
		knownModIds,
		userOverridesKey,
		metadataScanKey: `${knownModIds.join('\n')}\u0000${JSON.stringify(userOverridesKey)}`
	};
}

export function setModMetadataCacheData(cache: Map<string, ModMetadataCacheData>) {
	modMetadataCacheRef.set(new Map(cache));
}

function getModMetadataCacheKey({ localDir, scanRequest, attempt, treatNuterraSteamBetaAsEquivalent }: ModMetadataQueryOptionsInput) {
	return JSON.stringify([
		localDir ?? null,
		scanRequest.knownModIds,
		attempt,
		treatNuterraSteamBetaAsEquivalent,
		scanRequest.userOverridesKey
	]);
}

export async function readModMetadataCache(input: ModMetadataQueryOptionsInput): Promise<ModMetadataCacheData> {
	const dependencyGraphOptions = {
		treatNuterraSteamBetaAsEquivalent: input.treatNuterraSteamBetaAsEquivalent
	};
	const cacheKey = getModMetadataCacheKey(input);
	if (!input.forceReload) {
		const cachedMods = modMetadataCacheRef.value.get(cacheKey);
		if (cachedMods) {
			return cachedMods;
		}
	}
	const mods = await runRenderer(
		readModMetadataEffect(input.localDir, input.scanRequest.knownModIds, input.userOverrides, dependencyGraphOptions)
	);
	modMetadataCacheRef.set(new Map(modMetadataCacheRef.value).set(cacheKey, mods));
	return mods;
}

const readModMetadataEffect = Effect.fnUntraced(function* (
	localDir: string | undefined,
	knownModIds: readonly string[],
	userOverrides: Map<string, ModDataOverride>,
	dependencyGraphOptions: { treatNuterraSteamBetaAsEquivalent: boolean }
): Effect.fn.Return<ReturnType<typeof hydrateSessionMods>, unknown, RendererElectron> {
	const renderer = yield* RendererElectron;
	const mods = yield* Effect.tryPromise({
		try: () => renderer.electron.readModMetadata(localDir, [...knownModIds], dependencyGraphOptions),
		catch: (error) => error
	});
	return hydrateSessionMods(mods, userOverrides, dependencyGraphOptions);
});
