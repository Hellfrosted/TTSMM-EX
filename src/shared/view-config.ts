export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function compactRecord<T>(
	record: unknown,
	validKeys: Set<string>,
	isValidValue: (value: unknown) => value is T
): Record<string, T> | undefined {
	if (!record || typeof record !== 'object' || Array.isArray(record)) {
		return undefined;
	}

	const compacted = Object.entries(record).reduce<Record<string, T>>((nextRecord, [key, value]) => {
		if (validKeys.has(key) && isValidValue(value)) {
			nextRecord[key] = value;
		}
		return nextRecord;
	}, {});

	return Object.keys(compacted).length > 0 ? compacted : undefined;
}

export function compactConfiguredOrder<T extends string>(configuredOrder: unknown, defaultOrder: readonly T[]): T[] | undefined {
	if (!Array.isArray(configuredOrder)) {
		return undefined;
	}

	const defaultColumnSet = new Set<string>(defaultOrder);
	const configuredColumnSet = new Set<T>();
	const compactedOrder = configuredOrder.filter((column): column is T => {
		if (typeof column !== 'string' || !defaultColumnSet.has(column) || configuredColumnSet.has(column as T)) {
			return false;
		}
		configuredColumnSet.add(column as T);
		return true;
	});

	return compactedOrder.length > 0 ? compactedOrder : undefined;
}

export function normalizedOrder<T extends string>(configuredOrder: readonly string[] | undefined, defaultOrder: readonly T[]) {
	const configuredColumns = compactConfiguredOrder(configuredOrder, defaultOrder) ?? [];
	const configuredColumnSet = new Set(configuredColumns);
	return [...configuredColumns, ...defaultOrder.filter((column) => !configuredColumnSet.has(column))];
}

export function defaultEquivalentOrder<T extends string>(order: readonly T[], defaultOrder: readonly T[]) {
	return order.length === defaultOrder.length && order.every((column, index) => column === defaultOrder[index]);
}
