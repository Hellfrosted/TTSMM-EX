import type { Effect } from 'effect';
import type { ModData, NuterraSteamCompatibilityOptions } from '../model';
import type { SteamPersonaCache } from './steam-persona-cache';
import type { SteamUGCDetails } from './steamworks';

export type UnresolvedWorkshopReason = 'non-mod' | 'duplicate' | 'metadata-failed' | 'hydration-failed';
export type WorkshopInventoryItemSource = 'subscribed' | 'known' | 'dependency';

export interface UnresolvedWorkshopItem {
	reason: UnresolvedWorkshopReason;
	workshopID: bigint;
}

export interface WorkshopInventoryScanOutcome {
	mods: ModData[];
	stats: {
		dependencyItems: number;
		knownItems: number;
		subscribedItems: number;
	};
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

export interface WorkshopInventorySubscribedPage {
	items: SteamUGCDetails[];
	itemIDs?: Iterable<bigint>;
	numReturned: number;
	totalItems: number;
}

export type WorkshopInventoryProgressEffect =
	| {
			count: number;
			type: 'increment-loaded-mods' | 'increment-workshop-total';
	  }
	| {
			total: number;
			type: 'set-workshop-total';
	  };

export interface WorkshopModBuildOutcome {
	mods: ModData[];
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

export interface WorkshopInventoryResolvedRecord {
	mod: ModData;
	source: WorkshopInventoryItemSource;
}

export interface WorkshopDependencyChunkOutcome {
	missingDependencies: Set<bigint>;
	resolvedRecords: WorkshopInventoryResolvedRecord[];
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}

export interface WorkshopDependencyExpansionAdapters {
	getDetailsForWorkshopModList: (
		workshopIDs: bigint[],
		keepUnknownWorkshopItem?: (workshopID: bigint) => boolean
	) => Effect.Effect<ModData[], unknown, SteamPersonaCache>;
	keepUnknownWorkshopItem?: (workshopID: bigint) => boolean;
	knownWorkshopMods: Set<bigint>;
	onProgressEffect?: (effect: WorkshopInventoryProgressEffect) => void;
	options?: NuterraSteamCompatibilityOptions;
}

export interface WorkshopInventoryDependencyExpansionOptions {
	adapters: WorkshopDependencyExpansionAdapters;
	onProgressEffect?: (effect: WorkshopInventoryProgressEffect) => void;
}

export type BuildWorkshopMod = (
	workshopID: bigint,
	steamUGCDetails?: SteamUGCDetails,
	keepUnknownWorkshopItem?: boolean
) => Effect.Effect<ModData | null, unknown, SteamPersonaCache>;

export interface WorkshopInventoryExpansionScanInput {
	buildWorkshopMod: BuildWorkshopMod;
	fetchSubscribedPage: (page: number) => Effect.Effect<WorkshopInventorySubscribedPage, unknown, SteamPersonaCache>;
	getDetailsForWorkshopModList: WorkshopDependencyExpansionAdapters['getDetailsForWorkshopModList'];
	knownWorkshopMods: Set<bigint>;
	logDebug?: (message: string) => void;
	onProgressEffect?: (effect: WorkshopInventoryProgressEffect) => void;
	options?: NuterraSteamCompatibilityOptions;
}

export interface WorkshopInventorySubscribedPageObservation {
	builtPageMods: WorkshopModBuildOutcome;
	missingDetailMods: WorkshopModBuildOutcome;
	page: WorkshopInventorySubscribedPage;
}

export interface WorkshopInventorySubscribedPageTransition {
	progressEffect: WorkshopInventoryProgressEffect;
	resolvedRecords: WorkshopInventoryResolvedRecord[];
	subscribedItems: number;
	unresolvedWorkshopItems: UnresolvedWorkshopItem[];
}
