import axios from 'axios';
import log from 'electron-log';
import { parse } from 'node-html-parser';

export interface WorkshopDependencyLookup {
	steamDependencies: bigint[];
	steamDependencyNames?: Record<string, string>;
}

const workshopDependencyLookupCache = new Map<string, Promise<WorkshopDependencyLookup | null>>();

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
		} catch (error) {
			log.warn(`Failed to parse workshop dependency link "${href}"`);
			return;
		}

		if (!dependencyID || seenDependencies.has(dependencyID)) {
			return;
		}

		try {
			steamDependencies.push(BigInt(dependencyID));
		} catch (error) {
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
	const existingLookup = workshopDependencyLookupCache.get(cacheKey);
	if (existingLookup) {
		return existingLookup;
	}

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
			return parseWorkshopDependencyLookup(response.data);
		})
		.catch((error) => {
			log.warn(`Failed to fetch workshop dependencies for ${cacheKey}`);
			log.warn(error);
			workshopDependencyLookupCache.delete(cacheKey);
			return null;
		});

	workshopDependencyLookupCache.set(cacheKey, pendingLookup);
	return pendingLookup;
}
