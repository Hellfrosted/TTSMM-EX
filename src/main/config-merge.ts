import { isDeepStrictEqual } from 'node:util';
import type { AppConfig } from '../model';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function mergeMap(current: Map<unknown, unknown>, base: Map<unknown, unknown>, next: Map<unknown, unknown>) {
	const result = new Map(current);
	for (const key of new Set([...base.keys(), ...next.keys()])) {
		if (!next.has(key)) result.delete(key);
		else result.set(key, mergeChanges(current.get(key), base.get(key), next.get(key)));
	}
	return result;
}

function mergeRecord(current: Record<string, unknown>, base: Record<string, unknown>, next: Record<string, unknown>) {
	const result = { ...current };
	for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
		if (!Object.hasOwn(next, key)) delete result[key];
		else
			Object.defineProperty(result, key, {
				value: mergeChanges(
					Object.hasOwn(current, key) ? current[key] : undefined,
					Object.hasOwn(base, key) ? base[key] : undefined,
					next[key]
				),
				writable: true,
				enumerable: true,
				configurable: true
			});
	}
	return result;
}

function mergeAdded(current: unknown, next: unknown): unknown {
	if (current instanceof Map && next instanceof Map) return mergeMap(current, new Map(), next);
	if (isRecord(current) && isRecord(next)) return mergeRecord(current, {}, next);
	return next;
}

function mergeChanges(current: unknown, base: unknown, next: unknown): unknown {
	if (isDeepStrictEqual(base, next)) return current;
	if (base === undefined) return mergeAdded(current, next);
	if (current instanceof Map && next instanceof Map) {
		if (base instanceof Map) return mergeMap(current, base, next);
	}
	if (isRecord(current) && isRecord(next)) {
		if (isRecord(base)) return mergeRecord(current, base, next);
	}
	return next;
}

export function mergeConfigChanges(current: AppConfig, base: AppConfig, next: AppConfig): AppConfig {
	return mergeChanges(current, base, next) as AppConfig;
}
