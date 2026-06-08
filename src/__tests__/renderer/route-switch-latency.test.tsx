// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAppShellViewModel, getAppRouteKind } from '../../renderer/app-view-model';
import type { AppRouteKind } from '../../shared/app-route-policy';

interface RouteSwitchCase {
	readonly pathname: string | undefined;
	readonly routeKind: AppRouteKind;
	readonly score: number;
}

const ROUTE_SWITCH_CASES = [
	{ pathname: undefined, routeKind: 'collections', score: 1 },
	{ pathname: '', routeKind: 'collections', score: 1 },
	{ pathname: '/collections/main', routeKind: 'collections', score: 1 },
	{ pathname: '/collections/loading-history', routeKind: 'collections', score: 1 },
	{ pathname: '/settings', routeKind: 'settings', score: 2 },
	{ pathname: 'settings/preferences', routeKind: 'settings', score: 2 },
	{ pathname: '/block-lookup', routeKind: 'block-lookup', score: 3 },
	{ pathname: '/block-lookup/table', routeKind: 'block-lookup', score: 3 },
	{ pathname: '/population-pool', routeKind: 'population-pool', score: 4 },
	{ pathname: '/population-pool/workshop', routeKind: 'population-pool', score: 4 },
	{ pathname: '/loading/config', routeKind: 'loading', score: 5 },
	{ pathname: '/loading/steamworks', routeKind: 'loading', score: 5 },
	{ pathname: '/settings-but-not-settings', routeKind: 'collections', score: 1 },
	{ pathname: '/block-lookupish', routeKind: 'collections', score: 1 },
	{ pathname: '/population-poolish', routeKind: 'collections', score: 1 },
	{ pathname: '/loadingish', routeKind: 'collections', score: 1 }
] as const satisfies readonly RouteSwitchCase[];

const ITERATIONS_PER_SAMPLE = 200_000;
const SAMPLE_COUNT = 7;
const MAX_BEST_SAMPLE_MS = 300;

function scoreShell(pathname: string | undefined) {
	const routeKind = getAppRouteKind(pathname);
	const shell = createAppShellViewModel({
		activeCollection: undefined,
		configErrorCount: 0,
		launchingGame: false,
		loadingMods: false,
		madeConfigEdits: false,
		pathname: pathname ?? '',
		savingConfig: false
	});

	return (
		(routeKind === 'collections' ? 1 : 0) +
		(shell.showCollections ? 2 : 0) +
		(shell.showSettings ? 3 : 0) +
		(shell.showBlockLookup ? 5 : 0) +
		(shell.showPopulationPool ? 7 : 0) +
		(shell.isLoadingRoute ? 11 : 0)
	);
}

function expectedScore(routeKind: AppRouteKind) {
	switch (routeKind) {
		case 'collections':
			return 3;
		case 'settings':
			return 3;
		case 'block-lookup':
			return 5;
		case 'population-pool':
			return 7;
		case 'loading':
			return 11;
	}
}

function runRouteSwitchSample() {
	let actualChecksum = 0;
	let expectedChecksum = 0;
	const startedAt = performance.now();

	for (let index = 0; index < ITERATIONS_PER_SAMPLE; index += 1) {
		const routeCase = ROUTE_SWITCH_CASES[index % ROUTE_SWITCH_CASES.length];
		actualChecksum += scoreShell(routeCase.pathname);
		expectedChecksum += expectedScore(routeCase.routeKind);
	}

	return {
		actualChecksum,
		durationMs: performance.now() - startedAt,
		expectedChecksum
	};
}

describe('route switch latency', () => {
	it('keeps app route classification and shell derivation fast enough for workspace switches', () => {
		runRouteSwitchSample();

		const samples = Array.from({ length: SAMPLE_COUNT }, () => runRouteSwitchSample());
		const bestDurationMs = Math.min(...samples.map((sample) => sample.durationMs));
		const averageDurationMs = samples.reduce((total, sample) => total + sample.durationMs, 0) / samples.length;

		for (const sample of samples) {
			expect(sample.actualChecksum).toBe(sample.expectedChecksum);
		}

		console.info('[ttsmm-route-switch-bench]', {
			averageDurationMs: Number(averageDurationMs.toFixed(3)),
			bestDurationMs: Number(bestDurationMs.toFixed(3)),
			iterationsPerSample: ITERATIONS_PER_SAMPLE,
			sampleCount: SAMPLE_COUNT
		});

		expect(bestDurationMs).toBeLessThan(MAX_BEST_SAMPLE_MS);
	});
});
