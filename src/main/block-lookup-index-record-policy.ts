import type { BlockLookupRecord } from 'shared/block-lookup';

const SOURCE_KIND_PRIORITY: Record<BlockLookupRecord['sourceKind'], number> = {
	json: 0,
	bundle: 1,
	vanilla: 2
};

function normalizeBlockLookupRecordIdentityPart(value: string): string {
	return value.trim().toLowerCase();
}

function createBlockLookupRecordIdIdentity(record: BlockLookupRecord): string | undefined {
	if (!record.blockId) {
		return undefined;
	}
	return [record.workshopId, record.modTitle, `id:${record.blockId}`].map(normalizeBlockLookupRecordIdentityPart).join('\0');
}

function createBlockLookupRecordNameIdentity(record: BlockLookupRecord): string {
	return [record.workshopId, record.modTitle, `name:${record.blockName}:${record.internalName}`]
		.map(normalizeBlockLookupRecordIdentityPart)
		.join('\0');
}

function shouldReplaceBlockLookupRecord(existing: BlockLookupRecord, candidate: BlockLookupRecord): boolean {
	if (existing.blockId && !candidate.blockId) {
		return false;
	}
	if (!existing.blockId && candidate.blockId) {
		return true;
	}

	const existingPriority = SOURCE_KIND_PRIORITY[existing.sourceKind];
	const candidatePriority = SOURCE_KIND_PRIORITY[candidate.sourceKind];
	if (candidatePriority !== existingPriority) {
		return candidatePriority < existingPriority;
	}
	if (!existing.renderedPreview && candidate.renderedPreview) {
		return true;
	}
	return !existing.previewBounds && !!candidate.previewBounds;
}

function mergeBlockLookupRecordPreview(record: BlockLookupRecord, fallbackRecord: BlockLookupRecord): BlockLookupRecord {
	return {
		...record,
		...(!record.previewBounds && fallbackRecord.previewBounds ? { previewBounds: fallbackRecord.previewBounds } : {}),
		...(!record.renderedPreview && fallbackRecord.renderedPreview ? { renderedPreview: fallbackRecord.renderedPreview } : {})
	};
}

export function dedupeBlockLookupRecords(records: readonly BlockLookupRecord[]): BlockLookupRecord[] {
	const entries: Array<{ record: BlockLookupRecord }> = [];
	const recordsById = new Map<string, { record: BlockLookupRecord }>();
	const recordsByName = new Map<string, { record: BlockLookupRecord }>();
	for (const record of records) {
		const idIdentity = createBlockLookupRecordIdIdentity(record);
		const nameIdentity = createBlockLookupRecordNameIdentity(record);
		const nameMatch = recordsByName.get(nameIdentity);
		const existingEntry =
			(idIdentity ? recordsById.get(idIdentity) : undefined) ??
			(nameMatch && (!record.blockId || !nameMatch.record.blockId || nameMatch.record.blockId === record.blockId) ? nameMatch : undefined);

		const entry = existingEntry ?? { record };
		if (!existingEntry) {
			entries.push(entry);
		} else if (shouldReplaceBlockLookupRecord(entry.record, record)) {
			entry.record = mergeBlockLookupRecordPreview(record, entry.record);
		} else {
			entry.record = mergeBlockLookupRecordPreview(entry.record, record);
		}

		const entryIdIdentity = createBlockLookupRecordIdIdentity(entry.record);
		if (entryIdIdentity) {
			recordsById.set(entryIdIdentity, entry);
		}
		recordsByName.set(createBlockLookupRecordNameIdentity(entry.record), entry);
	}
	return entries.map((entry) => entry.record);
}
