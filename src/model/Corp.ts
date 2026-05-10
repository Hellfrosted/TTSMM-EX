export enum CorpType {
	HE = 'he',
	GSO = 'gso',
	GC = 'gc',
	BF = 'bf',
	VEN = 'ven',
	RR = 'rr',
	SPE = 'spe'
}

const CORP_DISPLAY_NAMES: Record<CorpType, string> = {
	[CorpType.HE]: 'Hawkeye',
	[CorpType.GSO]: 'GSO',
	[CorpType.GC]: 'GeoCorp',
	[CorpType.BF]: 'Better Future',
	[CorpType.VEN]: 'Venture',
	[CorpType.RR]: 'Reticule Research',
	[CorpType.SPE]: 'Special'
};

function normalizeCorpTag(tag: string) {
	return tag.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getCorpType(tag: string): CorpType | null {
	const normalizedTag = normalizeCorpTag(tag);
	if (normalizedTag === 'gso') {
		return CorpType.GSO;
	}
	if (normalizedTag === 'he' || normalizedTag === 'hawkeye') {
		return CorpType.HE;
	}
	if (normalizedTag === 'gc' || normalizedTag === 'geocorp') {
		return CorpType.GC;
	}
	if (normalizedTag === 'ven' || normalizedTag === 'venture') {
		return CorpType.VEN;
	}
	if (normalizedTag === 'bf' || normalizedTag === 'betterfuture') {
		return CorpType.BF;
	}
	if (normalizedTag === 'rr' || normalizedTag === 'reticuleresearch') {
		return CorpType.RR;
	}
	if (normalizedTag === 'spe' || normalizedTag === 'special') {
		return CorpType.SPE;
	}
	return null;
}

export function getCorpDisplayName(corp: CorpType) {
	return CORP_DISPLAY_NAMES[corp];
}
