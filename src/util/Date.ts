import dateFormat from 'dateformat';

const ZERO_DATE: Date = new Date(0);
const MAX_FORMATTED_DATE_CACHE_ENTRIES = 512;
const formattedDateCache = new Map<string, string>();

export function formatDateStr(date: Date | undefined, format = 'yyyy-mm-dd HH:MM'): string {
	if (!date || date <= ZERO_DATE) {
		return '';
	}

	const cacheKey = `${date.getTime()}:${format}`;
	const cached = formattedDateCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const formatted = dateFormat(date, format);
	if (formattedDateCache.size >= MAX_FORMATTED_DATE_CACHE_ENTRIES) {
		formattedDateCache.clear();
	}
	formattedDateCache.set(cacheKey, formatted);
	return formatted;
}
