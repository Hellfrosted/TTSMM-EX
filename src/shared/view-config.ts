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

export function normalizeTableViewConfig<T extends string>(
	input: unknown,
	columns: readonly T[],
	options: {
		normalizeWidth: (column: T, width: number) => number;
		defaultWidth?: (column: T) => number;
		preserveFalseSmallRows?: boolean;
	}
): { columnOrder?: T[]; columnActiveConfig?: Record<string, boolean>; columnWidthConfig?: Record<string, number>; smallRows?: boolean } {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
	const config = input as Record<string, unknown>;
	const knownColumns = new Set<string>(columns);
	const order = compactConfiguredOrder(config.columnOrder, columns);
	const active = compactRecord(config.columnActiveConfig, knownColumns, (value): value is boolean => typeof value === 'boolean');
	const widths = compactRecord(config.columnWidthConfig, knownColumns, isFiniteNumber);
	const normalizedWidths: Record<string, number> = {};
	for (const [key, width] of Object.entries(widths ?? {})) {
		const column = key as T;
		const normalized = options.normalizeWidth(column, width);
		if (!options.defaultWidth || normalized !== options.defaultWidth(column)) normalizedWidths[key] = normalized;
	}
	return {
		...(order && !defaultEquivalentOrder(order, columns) ? { columnOrder: order } : {}),
		...(active ? { columnActiveConfig: active } : {}),
		...(Object.keys(normalizedWidths).length ? { columnWidthConfig: normalizedWidths } : {}),
		...(config.smallRows === true || (options.preserveFalseSmallRows && config.smallRows === false) ? { smallRows: config.smallRows } : {})
	};
}
