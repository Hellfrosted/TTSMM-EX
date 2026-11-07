import { TERRATECH_STEAM_APP_ID } from 'shared/terratech';
import Steamworks from './steamworks';

type WorkshopDetails = {
	publishedFileId: bigint;
	title: string;
	tagsDisplayNames: string[];
	previewURL: string;
};

function readTech(item: Record<string, unknown>): WorkshopDetails | undefined {
	if (item.consumer_app_id !== Number(TERRATECH_STEAM_APP_ID) || !Array.isArray(item.tags)) return undefined;
	const tags = item.tags.flatMap((tag: unknown) => {
		if (!tag || typeof tag !== 'object' || typeof (tag as { tag?: unknown }).tag !== 'string') return [];
		return [(tag as { tag: string }).tag];
	});
	if (!tags.some((tag) => tag.toLowerCase() === 'techs')) return undefined;
	return {
		publishedFileId: BigInt(item.publishedfileid as string),
		title: typeof item.title === 'string' ? item.title : '',
		tagsDisplayNames: tags,
		previewURL: typeof item.preview_url === 'string' ? item.preview_url : ''
	};
}

function readDetails(entries: unknown[], batch: string[]) {
	const remainingIds = new Set(batch);
	const results: WorkshopDetails[] = [];
	let incomplete = false;
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Record<string, unknown>;
		if (typeof item.publishedfileid !== 'string' || !remainingIds.delete(item.publishedfileid)) continue;
		if (item.result !== 1 || !Array.isArray(item.tags)) {
			incomplete = true;
			continue;
		}
		const tech = readTech(item);
		if (tech) results.push(tech);
	}
	return { results, incomplete: incomplete || remainingIds.size > 0 };
}

export async function getPublicSubscribedTechs(warnings: string[]): Promise<WorkshopDetails[]> {
	const ids = Steamworks.getSubscribedItems().map(String);
	const results: WorkshopDetails[] = [];
	const deadline = Date.now() + 30_000;
	let incomplete = false;
	for (let offset = 0; offset < ids.length; offset += 100) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error('Workshop discovery timed out');
		const batch = ids.slice(offset, offset + 100);
		const body = new URLSearchParams({ itemcount: String(batch.length) });
		batch.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));
		const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
			method: 'POST',
			body,
			signal: AbortSignal.timeout(remaining),
			redirect: 'error'
		});
		if (!response.ok) throw new Error('Workshop details request failed');
		const payload: unknown = await response.json();
		const entries = (payload as { response?: { publishedfiledetails?: unknown } })?.response?.publishedfiledetails;
		if (!Array.isArray(entries)) throw new Error('Invalid Workshop details response');
		const page = readDetails(entries, batch);
		results.push(...page.results);
		incomplete ||= page.incomplete;
	}
	if (incomplete) warnings.push('Workshop Tech Candidate discovery returned incomplete results. Some items may not be public.');
	return results;
}
