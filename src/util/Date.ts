const ZERO_DATE: Date = new Date(0);
const MAX_FORMATTED_DATE_CACHE_ENTRIES = 512;
const formattedDateCache = new Map<string, string>();

const padTwoDigits = (value: number) => String(value).padStart(2, '0');

export function formatDateStr(date: Date | undefined): string {
	if (!date || date <= ZERO_DATE) {
		return '';
	}

	const time = date.getTime();
	if (Number.isNaN(time)) {
		throw new TypeError('Invalid date');
	}

	const cacheKey = String(time);
	const cached = formattedDateCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const formatted = [
		date.getFullYear(),
		'-',
		padTwoDigits(date.getMonth() + 1),
		'-',
		padTwoDigits(date.getDate()),
		' ',
		padTwoDigits(date.getHours()),
		':',
		padTwoDigits(date.getMinutes())
	].join('');
	if (formattedDateCache.size >= MAX_FORMATTED_DATE_CACHE_ENTRIES) {
		formattedDateCache.clear();
	}
	formattedDateCache.set(cacheKey, formatted);
	return formatted;
}
