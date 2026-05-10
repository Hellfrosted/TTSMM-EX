import { BLOCK_LOOKUP_COLUMN_KEYS, type BlockLookupViewConfig } from 'model/BlockLookupView';

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function compactRecord<T>(record: unknown, validKeys: Set<string>, isValidValue: (value: unknown) => value is T) {
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

function compactColumnOrder(value: unknown) {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const validKeySet = new Set<string>(BLOCK_LOOKUP_COLUMN_KEYS);
	const configuredKeySet = new Set<string>();
	const columnOrder = value.filter((key): key is string => {
		if (typeof key !== 'string' || !validKeySet.has(key) || configuredKeySet.has(key)) {
			return false;
		}
		configuredKeySet.add(key);
		return true;
	});

	return columnOrder.length > 0 ? columnOrder : undefined;
}

function defaultEquivalentOrder(order: readonly string[]) {
	return order.length === BLOCK_LOOKUP_COLUMN_KEYS.length && order.every((key, index) => key === BLOCK_LOOKUP_COLUMN_KEYS[index]);
}

export function normalizeBlockLookupViewConfig(config?: BlockLookupViewConfig | Record<string, unknown>): BlockLookupViewConfig {
	const columnKeySet = new Set<string>(BLOCK_LOOKUP_COLUMN_KEYS);
	const columnOrder = compactColumnOrder(config?.columnOrder);
	const normalizedConfig: BlockLookupViewConfig = {
		columnActiveConfig: compactRecord(config?.columnActiveConfig, columnKeySet, (value): value is boolean => typeof value === 'boolean'),
		columnWidthConfig: compactRecord(config?.columnWidthConfig, columnKeySet, isFiniteNumber),
		columnOrder: columnOrder && !defaultEquivalentOrder(columnOrder) ? columnOrder : undefined
	};

	if (config?.smallRows === true) {
		normalizedConfig.smallRows = true;
	}
	if (!normalizedConfig.columnActiveConfig) {
		delete normalizedConfig.columnActiveConfig;
	}
	if (!normalizedConfig.columnWidthConfig) {
		delete normalizedConfig.columnWidthConfig;
	}
	if (!normalizedConfig.columnOrder) {
		delete normalizedConfig.columnOrder;
	}

	return normalizedConfig;
}
