import axios from 'axios';
import log from 'electron-log';
import { parse } from 'node-html-parser';
import { WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS } from 'shared/workshop-dependency-lookup';

interface WorkshopDependencyLookup {
	steamDependencies: bigint[];
	steamDependencyNames?: Record<string, string>;
	steamDependenciesFetchedAt?: number;
}

interface WorkshopDependencyLookupCacheEntry {
	lookup: Promise<WorkshopDependencyLookup | null>;
	expiresAt: number;
}

const MAX_WORKSHOP_DEPENDENCY_LOOKUP_CACHE_SIZE = 200;
const workshopDependencyLookupCache = new Map<string, WorkshopDependencyLookupCacheEntry>();

function pruneWorkshopDependencyLookupCache(now = Date.now()) {
	for (const [cacheKey, cacheEntry] of workshopDependencyLookupCache.entries()) {
		if (cacheEntry.expiresAt <= now) {
			workshopDependencyLookupCache.delete(cacheKey);
		}
	}

	while (workshopDependencyLookupCache.size > MAX_WORKSHOP_DEPENDENCY_LOOKUP_CACHE_SIZE) {
		const oldestCacheKey = workshopDependencyLookupCache.keys().next().value;
		if (oldestCacheKey === undefined) {
			break;
		}

		workshopDependencyLookupCache.delete(oldestCacheKey);
	}
}

export function clearWorkshopDependencyLookupCache() {
	workshopDependencyLookupCache.clear();
}

export function parseWorkshopDependencyLookup(html: string): WorkshopDependencyLookup {
	const root = parse(html);
	const requiredItemsContainer = root.querySelector('#RequiredItems');
	if (!requiredItemsContainer) {
		return { steamDependencies: [] };
	}

	const steamDependencies: bigint[] = [];
	const steamDependencyNames: Record<string, string> = {};
	const seenDependencies = new Set<string>();

	requiredItemsContainer.querySelectorAll('a[href*="filedetails/?id="]').forEach((requiredItemLink) => {
		const href = requiredItemLink.getAttribute('href');
		if (!href) {
			return;
		}

		let dependencyID: string | null = null;
		try {
			dependencyID = new URL(href, 'https://steamcommunity.com').searchParams.get('id');
		} catch {
			log.warn(`Failed to parse workshop dependency link "${href}"`);
			return;
		}

		if (!dependencyID || seenDependencies.has(dependencyID)) {
			return;
		}

		try {
			steamDependencies.push(BigInt(dependencyID));
		} catch {
			log.warn(`Failed to parse workshop dependency id "${dependencyID}"`);
			return;
		}

		seenDependencies.add(dependencyID);
		const dependencyName = requiredItemLink.text.trim().replace(/\s+/g, ' ');
		if (dependencyName.length > 0) {
			steamDependencyNames[dependencyID] = dependencyName;
		}
	});

	return {
		steamDependencies,
		steamDependencyNames: Object.keys(steamDependencyNames).length > 0 ? steamDependencyNames : undefined
	};
}

export async function fetchWorkshopDependencyLookup(workshopID: bigint): Promise<WorkshopDependencyLookup | null> {
	const cacheKey = workshopID.toString();
	const now = Date.now();
	pruneWorkshopDependencyLookupCache(now);

	const existingLookup = workshopDependencyLookupCache.get(cacheKey);
	if (existingLookup && existingLookup.expiresAt > now) {
		return existingLookup.lookup;
	}

	workshopDependencyLookupCache.delete(cacheKey);

	const pendingLookup = axios
		.get<string>(`https://steamcommunity.com/sharedfiles/filedetails/?id=${cacheKey}`, {
			responseType: 'text',
			timeout: 10000,
			headers: {
				'Accept-Language': 'en-US,en;q=0.9',
				'User-Agent': 'Mozilla/5.0'
			}
		})
		.then((response) => {
			return {
				...parseWorkshopDependencyLookup(response.data),
				steamDependenciesFetchedAt: Date.now()
			};
		})
		.catch((error) => {
			log.warn(`Failed to fetch workshop dependencies for ${cacheKey}`);
			log.warn(error);
			workshopDependencyLookupCache.delete(cacheKey);
			return null;
		});

	workshopDependencyLookupCache.set(cacheKey, {
		lookup: pendingLookup,
		expiresAt: now + WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS
	});
	pruneWorkshopDependencyLookupCache(now);

	return pendingLookup;
}
