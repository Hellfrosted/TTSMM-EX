import type { ModData } from '../model';
import type { WorkshopInventoryItemSource, WorkshopInventoryResolvedRecord } from './workshop-inventory-types';

function getWorkshopInventorySourceRank(source: WorkshopInventoryItemSource) {
	switch (source) {
		case 'known':
			return 3;
		case 'subscribed':
			return 2;
		case 'dependency':
			return 1;
	}
}

function getWorkshopInventoryRecordQuality(mod: ModData) {
	if (mod.installed || !!mod.path || !!mod.id) {
		return 2;
	}
	return 1;
}

export function shouldPreferWorkshopInventoryRecord(current: WorkshopInventoryResolvedRecord, candidate: WorkshopInventoryResolvedRecord) {
	const currentQuality = getWorkshopInventoryRecordQuality(current.mod);
	const candidateQuality = getWorkshopInventoryRecordQuality(candidate.mod);
	if (candidateQuality !== currentQuality) {
		return candidateQuality > currentQuality;
	}

	return getWorkshopInventorySourceRank(candidate.source) > getWorkshopInventorySourceRank(current.source);
}

export function getWorkshopInventorySourceForKnownItem(
	workshopID: bigint,
	knownWorkshopMods: Set<bigint>,
	defaultSource: WorkshopInventoryItemSource = 'subscribed'
): WorkshopInventoryItemSource {
	return knownWorkshopMods.has(workshopID) ? 'known' : defaultSource;
}
