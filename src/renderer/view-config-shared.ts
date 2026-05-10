export function compactRecord<T>(record: Record<string, T>, validKeys: Set<string>, isValidValue: (value: T) => boolean) {
	const compacted = Object.entries(record).reduce<Record<string, T>>((nextRecord, [key, value]) => {
		if (validKeys.has(key) && isValidValue(value)) {
			nextRecord[key] = value;
		}
		return nextRecord;
	}, {});

	return Object.keys(compacted).length > 0 ? compacted : undefined;
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function collectConfiguredColumnOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	const defaultColumnSet = new Set<string>(defaultOrder);
	const configuredColumnSet = new Set<T>();
	return (configuredOrder || []).filter((column): column is T => {
		if (!defaultColumnSet.has(column) || configuredColumnSet.has(column as T)) {
			return false;
		}
		configuredColumnSet.add(column as T);
		return true;
	}) as T[];
}

export function normalizedOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	const configuredColumns = collectConfiguredColumnOrder(configuredOrder, defaultOrder);
	const configuredColumnSet = new Set(configuredColumns);
	return [...configuredColumns, ...defaultOrder.filter((column) => !configuredColumnSet.has(column))];
}

export function compactOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	if (!configuredOrder) {
		return undefined;
	}

	const configuredColumns = collectConfiguredColumnOrder(configuredOrder, defaultOrder);

	return configuredColumns.length > 0 ? configuredColumns : undefined;
}

export function defaultEquivalentOrder<T extends string>(order: readonly T[], defaultOrder: readonly T[]) {
	return order.length === defaultOrder.length && order.every((column, index) => column === defaultOrder[index]);
}
