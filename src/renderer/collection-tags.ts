import { getCorpDisplayName, getCorpType, type DisplayModData } from 'model';

export function getCanonicalCollectionTagLabel(tag: string) {
	const corp = getCorpType(tag);
	return corp ? getCorpDisplayName(corp) : tag.trim();
}

export function getAllCollectionTags(record: DisplayModData) {
	const tags = new Map<string, string>();
	[...(record.tags || []), ...(record.overrides?.tags || [])].forEach((tag) => {
		const trimmedTag = tag.trim();
		if (!trimmedTag || trimmedTag.toLowerCase() === 'mods' || /[\u0000-\u001F\u007F]/.test(trimmedTag)) {
			return;
		}

		const label = getCanonicalCollectionTagLabel(trimmedTag);
		const normalizedLabel = label.toLowerCase();
		if (label && !tags.has(normalizedLabel)) {
			tags.set(normalizedLabel, label);
		}
	});
	return [...tags.values()];
}
