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

export function defaultEquivalentOrder<T extends string>(order: readonly T[], defaultOrder: readonly T[]) {
	return order.length === defaultOrder.length && order.every((column, index) => column === defaultOrder[index]);
}
