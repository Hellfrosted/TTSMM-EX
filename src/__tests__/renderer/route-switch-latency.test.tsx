/// <reference path="../types/global.d.ts" />
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods, type AppConfig, type ModCollection, type ModData } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { queryClient } from '../../renderer/query-client';
import { AppRoutes } from '../../renderer/routes';
import type { BlockLookupIndexStats, BlockLookupRecord } from '../../shared/block-lookup';

const ENABLED = process.env.TTSMM_ROUTE_BENCH === '1';
const MOD_COUNT = 350;
const BLOCK_LOOKUP_RECORD_COUNT = 1400;
const WARMUP_ROUNDS = 3;
const MEASURED_ROUNDS = 12;

const TEST_STATS: BlockLookupIndexStats = {
	sources: MOD_COUNT,
	scanned: MOD_COUNT,
	skipped: 0,
	removed: 0,
	blocks: BLOCK_LOOKUP_RECORD_COUNT,
	updatedBlocks: BLOCK_LOOKUP_RECORD_COUNT,
	builtAt: new Date(0).toISOString()
};

type RouteTarget = 'collections' | 'blockLookup' | 'settings';

interface RouteTiming {
	durationMs: number;
	from: RouteTarget;
	to: RouteTarget;
}

function createRouteSwitchConfig(): AppConfig {
	return {
		...DEFAULT_CONFIG,
		activeCollection: 'default',
		currentPath: '/collections/main',
		gameExec: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe',
		localDir: 'C:\\Users\\tester\\Documents\\My Games\\TerraTech\\LocalMods',
		logsDir: 'C:\\Users\\tester\\AppData\\Roaming\\TTSMM-EX\\logs',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map()
	};
}

function createMod(index: number): ModData {
	const workshopID = BigInt(1_000_000 + index);
	const uid = `workshop:${workshopID.toString()}`;
	return {
		uid,
		id: `BenchMod${index.toString().padStart(3, '0')}`,
		name: `Benchmark Mod ${index.toString().padStart(3, '0')}`,
		authors: [`Author ${index % 25}`],
		description: `Benchmark metadata for route switching mod ${index}`,
		workshopID,
		type: ModType.WORKSHOP,
		tags: [`Tag ${index % 10}`, index % 2 === 0 ? 'Blocks' : 'Utility'],
		path: `C:\\Steam\\steamapps\\workshop\\content\\285920\\${workshopID.toString()}`,
		subscribed: true,
		installed: true,
		hasCode: index % 7 === 0,
		size: 32_000 + index * 19,
		lastUpdate: new Date(1_700_000_000_000 + index * 1000)
	};
}

function createBlockLookupRecord(index: number): BlockLookupRecord {
	const modIndex = index % MOD_COUNT;
	const workshopId = (1_000_000 + modIndex).toString();
	const blockName = `Bench Block ${index.toString().padStart(4, '0')}`;
	const modTitle = `Benchmark Mod ${modIndex.toString().padStart(3, '0')}`;
	const alias = `Bench_Block_${index.toString().padStart(4, '0')}(Benchmark_Mod_${modIndex.toString().padStart(3, '0')})`;
	return {
		blockName,
		internalName: `BenchBlock${index.toString().padStart(4, '0')}`,
		blockId: index.toString(),
		modTitle,
		workshopId,
		sourceKind: 'json',
		sourcePath: `C:\\Steam\\steamapps\\workshop\\content\\285920\\${workshopId}\\BlockJSON\\BenchBlock${index}.json`,
		preferredAlias: alias,
		fallbackAlias: alias,
		spawnCommand: `SpawnBlock ${alias}`,
		fallbackSpawnCommand: `SpawnBlock ${alias}`
	};
}

function createBenchmarkData() {
	const mods = Array.from({ length: MOD_COUNT }, (_value, index) => createMod(index + 1));
	const collection: ModCollection = {
		name: 'default',
		mods: mods.map((mod) => mod.uid)
	};
	const blockLookupRecords = Array.from({ length: BLOCK_LOOKUP_RECORD_COUNT }, (_value, index) => createBlockLookupRecord(index + 1));
	return {
		collection,
		collections: [collection],
		mods: new SessionMods('C:\\Users\\tester\\Documents\\My Games\\TerraTech\\LocalMods', mods),
		blockLookupRecords
	};
}

function configureBrowserTimingMocks() {
	const ResizeObserverMock = vi.fn(function ResizeObserverMock(this: ResizeObserver) {
		return {
			observe: vi.fn(),
			unobserve: vi.fn(),
			disconnect: vi.fn()
		};
	});
	vi.stubGlobal('ResizeObserver', ResizeObserverMock);

	let nextIdleId = 1;
	const idleTimers = new Map<number, ReturnType<typeof setTimeout>>();
	Object.defineProperty(window, 'requestIdleCallback', {
		configurable: true,
		value: (callback: IdleRequestCallback) => {
			const id = nextIdleId++;
			const timer = setTimeout(() => {
				idleTimers.delete(id);
				callback({
					didTimeout: false,
					timeRemaining: () => 50
				});
			}, 0);
			idleTimers.set(id, timer);
			return id;
		}
	});
	Object.defineProperty(window, 'cancelIdleCallback', {
		configurable: true,
		value: (id: number) => {
			const timer = idleTimers.get(id);
			if (timer) {
				clearTimeout(timer);
			}
			idleTimers.delete(id);
		}
	});
}

function setupBenchmarkIpc() {
	const config = createRouteSwitchConfig();
	const { blockLookupRecords, collection, collections, mods } = createBenchmarkData();
	Object.assign(window.electron, {
		uiSmokeMode: true
	});
	vi.mocked(window.electron.getUserDataPath).mockResolvedValue('C:\\Users\\tester\\AppData\\Roaming\\TTSMM-EX');
	vi.mocked(window.electron.readConfig).mockResolvedValue(config);
	vi.mocked(window.electron.resolveStartupCollection).mockImplementation(async ({ config: requestConfig }) => ({
		ok: true,
		activeCollection: collection,
		collections,
		collectionNames: collections.map((item) => item.name),
		config: {
			...requestConfig,
			activeCollection: collection.name
		}
	}));
	vi.mocked(window.electron.readModMetadata).mockResolvedValue(mods);
	vi.mocked(window.electron.readBlockLookupSettings).mockResolvedValue({
		workshopRoot: 'C:\\Steam\\steamapps\\workshop\\content\\285920'
	});
	vi.mocked(window.electron.getBlockLookupStats).mockResolvedValue(TEST_STATS);
	vi.mocked(window.electron.searchBlockLookup).mockImplementation(async (request) => {
		const query = request.query.trim().toLowerCase();
		const rows = query
			? blockLookupRecords.filter(
					(record) => record.spawnCommand.toLowerCase().includes(query) || record.blockName.toLowerCase().includes(query)
				)
			: blockLookupRecords;
		return {
			rows: request.limit ? rows.slice(0, request.limit) : rows,
			stats: TEST_STATS
		};
	});
	return { blockLookupRecords };
}

function getActiveStage(name: string) {
	const stage = document.querySelector(`[data-view-stage="${name}"][data-active="true"]`);
	expect(stage).toBeInTheDocument();
	return stage as HTMLElement;
}

async function waitForNextFrame() {
	await new Promise<void>((resolve) => {
		if (typeof window.requestAnimationFrame === 'function') {
			window.requestAnimationFrame(() => resolve());
			return;
		}
		window.setTimeout(resolve, 0);
	});
}

async function waitForRouteMarkerReady(target: RouteTarget) {
	await waitFor(() => {
		if (target === 'collections') {
			getActiveStage('collections');
			return;
		}
		if (target === 'blockLookup') {
			getActiveStage('block-lookup');
			return;
		}
		getActiveStage('settings');
	});
	await waitForNextFrame();
}

async function assertRouteContentReady(target: RouteTarget) {
	await waitFor(
		async () => {
			if (target === 'collections') {
				const stage = getActiveStage('collections');
				expect(within(stage).getByRole('table', { hidden: true })).toBeInTheDocument();
				expect(within(stage).getByRole('button', { name: 'Validate Collection' })).toBeEnabled();
				return;
			}
			if (target === 'blockLookup') {
				const stage = getActiveStage('block-lookup');
				expect(within(stage).getByRole('textbox', { name: 'Search block aliases' })).toBeEnabled();
				expect(within(stage).getByText(`${BLOCK_LOOKUP_RECORD_COUNT} indexed blocks from ${MOD_COUNT} sources`)).toBeInTheDocument();
				return;
			}
			const stage = getActiveStage('settings');
			expect(within(stage).getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
			expect(within(stage).getByLabelText('App logging level')).toBeEnabled();
		},
		{ timeout: 5000 }
	);
}

function getNavigationButton(target: RouteTarget) {
	if (target === 'collections') {
		return screen.getByRole('button', { name: 'Mod Collections' });
	}
	if (target === 'blockLookup') {
		return screen.getByRole('button', { name: 'Block Lookup' });
	}
	return screen.getByRole('button', { name: 'Settings' });
}

async function measureSwitch(from: RouteTarget, to: RouteTarget): Promise<RouteTiming> {
	await assertRouteContentReady(from);
	const navigationButton = getNavigationButton(to);
	const startedAt = performance.now();
	fireEvent.click(navigationButton);
	await waitForRouteMarkerReady(to);
	const durationMs = performance.now() - startedAt;
	await assertRouteContentReady(to);
	return {
		durationMs,
		from,
		to
	};
}

function percentile(values: number[], percentileRank: number) {
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1));
	return sorted[index] ?? 0;
}

function summarizeTimings(timings: RouteTiming[]) {
	const grouped = new Map<string, number[]>();
	for (const timing of timings) {
		const key = `${timing.from}->${timing.to}`;
		grouped.set(key, [...(grouped.get(key) ?? []), timing.durationMs]);
	}
	return [...grouped.entries()].map(([transition, values]) => ({
		transition,
		count: values.length,
		minMs: Number(Math.min(...values).toFixed(2)),
		medianMs: Number(percentile(values, 50).toFixed(2)),
		p95Ms: Number(percentile(values, 95).toFixed(2)),
		maxMs: Number(Math.max(...values).toFixed(2))
	}));
}

afterEach(() => {
	cleanup();
	queryClient.clear();
	vi.unstubAllGlobals();
});

describe.skipIf(!ENABLED)('route switch latency benchmark', () => {
	it('measures click-to-ready latency across primary app views with realistic mocked data', async () => {
		configureBrowserTimingMocks();
		setupBenchmarkIpc();
		render(
			<MemoryRouter initialEntries={['/loading/config']}>
				<AppRoutes />
			</MemoryRouter>
		);

		await vi.dynamicImportSettled();
		await assertRouteContentReady('collections');

		for (let round = 0; round < WARMUP_ROUNDS; round += 1) {
			await measureSwitch('collections', 'blockLookup');
			await measureSwitch('blockLookup', 'collections');
			await measureSwitch('collections', 'settings');
			await measureSwitch('settings', 'collections');
		}

		const timings: RouteTiming[] = [];
		for (let round = 0; round < MEASURED_ROUNDS; round += 1) {
			timings.push(await measureSwitch('collections', 'blockLookup'));
			timings.push(await measureSwitch('blockLookup', 'collections'));
			timings.push(await measureSwitch('collections', 'settings'));
			timings.push(await measureSwitch('settings', 'collections'));
		}

		const summary = summarizeTimings(timings);
		console.info(`[route-switch-benchmark] ${JSON.stringify(summary)}`);
		expect(summary).toHaveLength(4);
		expect(screen.getByRole('button', { name: 'Mod Collections' })).toHaveAttribute('aria-current', 'page');
	}, 60_000);
});
