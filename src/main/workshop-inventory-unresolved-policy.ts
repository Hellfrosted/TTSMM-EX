import type { SteamUGCDetails } from './steamworks';
import type { UnresolvedWorkshopItem, UnresolvedWorkshopReason } from './workshop-inventory-types';

export function getUnresolvedWorkshopReason(steamUGCDetails: SteamUGCDetails | undefined): UnresolvedWorkshopReason {
	if (!steamUGCDetails) {
		return 'metadata-failed';
	}
	return steamUGCDetails.tags?.some((tag) => tag.toLowerCase() === 'mods') ? 'hydration-failed' : 'non-mod';
}

export function appendUniqueUnresolvedWorkshopItem(items: UnresolvedWorkshopItem[], item: UnresolvedWorkshopItem) {
	if (!items.some((current) => current.workshopID === item.workshopID && current.reason === item.reason)) {
		items.push(item);
	}
}

export function hasUnresolvedWorkshopItem(items: UnresolvedWorkshopItem[], workshopID: bigint) {
	return items.some((item) => item.workshopID === workshopID);
}
