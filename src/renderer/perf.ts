import { Fragment, Profiler, createElement, type ReactNode } from 'react';
import type { ProfilerOnRenderCallback } from 'react';

const PERF_STORAGE_KEY = 'ttsmm.perf';
const SLOW_MEASURE_THRESHOLD_MS = 8;

type PerfMetadata = Record<string, string | number | boolean | undefined>;

function getNow() {
	return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export function isPerfLoggingEnabled() {
	if (typeof window === 'undefined') {
		return false;
	}

	try {
		const storedValue = window.localStorage.getItem(PERF_STORAGE_KEY);
		return storedValue === '1' || storedValue === 'true' || storedValue === 'on';
	} catch {
		return false;
	}
}

function logPerf(kind: string, name: string, durationMs?: number, metadata?: PerfMetadata) {
	if (!isPerfLoggingEnabled()) {
		return;
	}

	const duration = durationMs === undefined ? undefined : `${durationMs.toFixed(2)}ms`;
	const payload = metadata ? { ...metadata } : undefined;
	console.info(`[ttsmm-perf] ${kind}:${name}`, duration ?? '', payload ?? '');
}

export function markPerfInteraction(name: string, metadata?: PerfMetadata) {
	logPerf('interaction', name, undefined, metadata);
}

export function measurePerf<T>(name: string, run: () => T, metadata?: PerfMetadata): T {
	if (!isPerfLoggingEnabled()) {
		return run();
	}

	const startedAt = getNow();
	try {
		return run();
	} finally {
		const durationMs = getNow() - startedAt;
		logPerf(durationMs >= SLOW_MEASURE_THRESHOLD_MS ? 'measure:slow' : 'measure', name, durationMs, metadata);
	}
}

export async function measurePerfAsync<T>(name: string, run: () => Promise<T>, metadata?: PerfMetadata): Promise<T> {
	if (!isPerfLoggingEnabled()) {
		return run();
	}

	const startedAt = getNow();
	try {
		return await run();
	} finally {
		const durationMs = getNow() - startedAt;
		logPerf(durationMs >= SLOW_MEASURE_THRESHOLD_MS ? 'async:slow' : 'async', name, durationMs, metadata);
	}
}

export const logProfilerRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
	if (!isPerfLoggingEnabled()) {
		return;
	}

	logPerf('profiler', id, actualDuration, {
		phase,
		baseDuration: Number(baseDuration.toFixed(2)),
		startTime: Number(startTime.toFixed(2)),
		commitTime: Number(commitTime.toFixed(2))
	});
};

export function PerfProfiler({ children, id }: { children: ReactNode; id: string }) {
	if (!isPerfLoggingEnabled()) {
		return createElement(Fragment, null, children);
	}

	return createElement(Profiler, { id, onRender: logProfilerRender }, children);
}
