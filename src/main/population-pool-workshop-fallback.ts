import { Effect, Schema } from 'effect';
import { TERRATECH_STEAM_APP_ID } from 'shared/terratech';
import Steamworks from './steamworks';

export class WorkshopFallbackFailure extends Schema.TaggedError<WorkshopFallbackFailure>()('WorkshopFallbackFailure', {
	reason: Schema.Literals(['timeout', 'request-failed', 'invalid-response']),
	cause: Schema.Unknown
}) {}

type WorkshopDetails = {
	publishedFileId: bigint;
	title: string;
	tagsDisplayNames: string[];
	previewURL: string;
};

export interface WorkshopFallbackOptions {
	fetchImpl?: typeof fetch;
	getSubscribedIds?: () => bigint[];
	now?: () => number;
	deadlineMs?: number;
	maxRetries?: number;
	retryDelayMs?: number;
}

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

// fallow-ignore-next-line complexity -- validates untrusted Steam response fields in one pass; behavior is pinned by tests.
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

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded HTTP fallback for Workshop Tech discovery.
 *
 * Kept async because callers run under Electron IPC with fake timers in tests;
 * an Effect adapter below exposes the same typed failure to Effect programs.
 */
// fallow-ignore-next-line complexity -- bounded batch/retry loops plus response validation; behavior is pinned by tests.
export async function getPublicSubscribedTechs(warnings: string[], options: WorkshopFallbackOptions = {}): Promise<WorkshopDetails[]> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.now ?? Date.now;
	const deadline = now() + (options.deadlineMs ?? 30_000);
	const maxRetries = options.maxRetries ?? 2;
	const retryDelayMs = options.retryDelayMs ?? 100;
	const ids = (options.getSubscribedIds ?? (() => Steamworks.getSubscribedItems()))().map(String);
	const results: WorkshopDetails[] = [];
	let incomplete = false;

	for (let offset = 0; offset < ids.length; offset += 100) {
		const remaining = deadline - now();
		if (remaining <= 0) {
			throw new WorkshopFallbackFailure({ reason: 'timeout', cause: 'Workshop discovery timed out' });
		}

		const batch = ids.slice(offset, offset + 100);
		const body = new URLSearchParams({ itemcount: String(batch.length) });
		batch.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

		let response: Response | undefined;
		for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
			try {
				response = await fetchImpl('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
					method: 'POST',
					body,
					signal: AbortSignal.timeout(remaining),
					redirect: 'error'
				});
				break;
			} catch (cause) {
				if (attempt === maxRetries) {
					throw new WorkshopFallbackFailure({ reason: 'request-failed', cause });
				}
				await delay(retryDelayMs);
			}
		}

		if (!response?.ok) {
			throw new WorkshopFallbackFailure({ reason: 'request-failed', cause: `HTTP ${response?.status ?? 'no response'}` });
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch (cause) {
			throw new WorkshopFallbackFailure({ reason: 'invalid-response', cause });
		}
		const entries = (payload as { response?: { publishedfiledetails?: unknown } })?.response?.publishedfiledetails;
		if (!Array.isArray(entries)) {
			throw new WorkshopFallbackFailure({ reason: 'invalid-response', cause: 'Missing publishedfiledetails' });
		}

		const page = readDetails(entries, batch);
		results.push(...page.results);
		incomplete ||= page.incomplete;
	}

	if (incomplete) warnings.push('Workshop Tech Candidate discovery returned incomplete results. Some items may not be public.');
	return results;
}

export const getPublicSubscribedTechsProgram = Effect.fnUntraced(function* (
	warnings: string[],
	options: WorkshopFallbackOptions = {}
): Effect.fn.Return<WorkshopDetails[], WorkshopFallbackFailure> {
	return yield* Effect.tryPromise({
		try: () => getPublicSubscribedTechs(warnings, options),
		catch: (error) =>
			error instanceof WorkshopFallbackFailure ? error : new WorkshopFallbackFailure({ reason: 'request-failed', cause: error })
	});
});
