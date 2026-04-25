import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	fetchWorkshopDependencyLookup,
	parseWorkshopDependencyLookup,
	clearWorkshopDependencyLookupCache
} from '../../main/workshop-dependencies';
import { WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS } from '../../shared/workshop-dependency-lookup';

vi.mock('axios', () => ({
	default: {
		get: vi.fn()
	}
}));

describe('workshop dependency parsing', () => {
	afterEach(() => {
		clearWorkshopDependencyLookupCache();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('extracts required item ids and names from workshop html', () => {
		const html = `
			<div class="rightSectionTopTitle">Required items</div>
			<div class="requiredItemsContainer" id="RequiredItems">
				<a href="https://steamcommunity.com/workshop/filedetails/?id=2790966966" target="_blank">
					<div class="requiredItem">NuterraSteam (Beta)</div>
				</a>
				<a href="https://steamcommunity.com/workshop/filedetails/?id=2571814511" target="_blank">
					<div class="requiredItem">Harmony (2.2.2)</div>
				</a>
			</div>
		`;

		expect(parseWorkshopDependencyLookup(html)).toEqual({
			steamDependencies: [BigInt(2790966966), BigInt(2571814511)],
			steamDependencyNames: {
				'2571814511': 'Harmony (2.2.2)',
				'2790966966': 'NuterraSteam (Beta)'
			}
		});
	});

	it('returns an empty dependency list when the workshop page has no required items section', () => {
		expect(parseWorkshopDependencyLookup('<html><body><div>No dependencies here</div></body></html>')).toEqual({
			steamDependencies: []
		});
	});

	it('refreshes cached dependency lookups after the ttl expires', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-14T12:00:00Z'));
		vi.mocked(axios.get)
			.mockResolvedValueOnce({
				data: `
					<div id="RequiredItems">
						<a href="/workshop/filedetails/?id=11">Harmony</a>
					</div>
				`
			} as never)
			.mockResolvedValueOnce({
				data: `
					<div id="RequiredItems">
						<a href="/workshop/filedetails/?id=22">NuterraSteam</a>
					</div>
				`
			} as never);

		const firstLookup = await fetchWorkshopDependencyLookup(BigInt(77));
		const cachedLookup = await fetchWorkshopDependencyLookup(BigInt(77));

		expect(axios.get).toHaveBeenCalledTimes(1);
		expect(firstLookup).toEqual({
			steamDependencies: [BigInt(11)],
			steamDependencyNames: {
				'11': 'Harmony'
			},
			steamDependenciesFetchedAt: new Date('2026-04-14T12:00:00Z').getTime()
		});
		expect(cachedLookup).toEqual(firstLookup);

		vi.setSystemTime(new Date('2026-04-14T12:00:00Z').getTime() + WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS + 1);

		const refreshedLookup = await fetchWorkshopDependencyLookup(BigInt(77));

		expect(axios.get).toHaveBeenCalledTimes(2);
		expect(refreshedLookup).toEqual({
			steamDependencies: [BigInt(22)],
			steamDependencyNames: {
				'22': 'NuterraSteam'
			},
			steamDependenciesFetchedAt: new Date('2026-04-14T12:00:00Z').getTime() + WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS + 1
		});
	});
});
