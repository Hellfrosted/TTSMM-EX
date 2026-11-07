import { isDeepStrictEqual } from 'node:util';
import type { AppConfig } from '../model';

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function mergeChanges(current: unknown, base: unknown, next: unknown): unknown {
	if (isDeepStrictEqual(base, next)) return current;
	if (base === undefined && current instanceof Map && next instanceof Map) return mergeChanges(current, new Map(), next);
	if (base === undefined && isRecord(current) && isRecord(next)) return mergeChanges(current, {}, next);
	if (base instanceof Map && next instanceof Map && current instanceof Map) {
		const result = new Map(current);
		for (const key of new Set([...base.keys(), ...next.keys()])) {
			if (!next.has(key)) result.delete(key);
			else if (!base.has(key)) result.set(key, mergeChanges(current.get(key), undefined, next.get(key)));
			else result.set(key, mergeChanges(current.get(key), base.get(key), next.get(key)));
		}
		return result;
	}
	if (isRecord(base) && isRecord(next) && isRecord(current)) {
		const result = { ...current };
		for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
			if (!Object.hasOwn(next, key)) delete result[key];
			else if (!Object.hasOwn(base, key))
				Object.defineProperty(result, key, {
					value: mergeChanges(current[key], undefined, next[key]),
					writable: true,
					enumerable: true,
					configurable: true
				});
			else
				Object.defineProperty(result, key, {
					value: mergeChanges(current[key], base[key], next[key]),
					writable: true,
					enumerable: true,
					configurable: true
				});
		}
		return result;
	}
	return next;
}

export function mergeConfigChanges(current: AppConfig, base: AppConfig, next: AppConfig): AppConfig {
	return mergeChanges(current, base, next) as AppConfig;
}
