import { Effect } from 'effect';
import { TERRATECH_STEAM_APP_ID } from 'shared/terratech';
import { describe, expect, it, vi } from 'vitest';
import { getPublicSubscribedTechsProgram } from '../../main/population-pool-workshop-fallback';

const publishedId = '42';
const techPayload = {
	response: {
		publishedfiledetails: [
			{
				publishedfileid: publishedId,
				result: 1,
				consumer_app_id: Number(TERRATECH_STEAM_APP_ID),
				title: 'A Tech',
				preview_url: 'https://example.test/preview.png',
				tags: [{ tag: 'Techs' }]
			}
		]
	}
};

function response(payload: unknown, ok = true) {
	return { ok, status: ok ? 200 : 503, json: async () => payload } as unknown as Response;
}

function optionsWith(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
	return {
		fetchImpl,
		getSubscribedIds: () => [BigInt(publishedId)],
		retryDelayMs: 0,
		...overrides
	};
}

describe('getPublicSubscribedTechsProgram', () => {
	it('returns public tech details', async () => {
		const fetchImpl = vi.fn(async () => response(techPayload));
		const warnings: string[] = [];

		const details = await Effect.runPromise(getPublicSubscribedTechsProgram(warnings, optionsWith(fetchImpl)));

		expect(details).toMatchObject([{ publishedFileId: BigInt(publishedId), title: 'A Tech', tagsDisplayNames: ['Techs'] }]);
		expect(warnings).toEqual([]);
	});

	it('retries transient request failures and keeps the last result', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(response(techPayload));

		const details = await Effect.runPromise(getPublicSubscribedTechsProgram([], optionsWith(fetchImpl)));

		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(details).toHaveLength(1);
	});

	it('fails with a typed error after the retry budget is spent', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));

		await expect(Effect.runPromise(getPublicSubscribedTechsProgram([], optionsWith(fetchImpl)))).rejects.toMatchObject({
			_tag: 'WorkshopFallbackFailure',
			reason: 'request-failed'
		});
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it('does not retry a malformed response', async () => {
		const fetchImpl = vi.fn(async () => response({}));

		await expect(Effect.runPromise(getPublicSubscribedTechsProgram([], optionsWith(fetchImpl)))).rejects.toMatchObject({
			_tag: 'WorkshopFallbackFailure',
			reason: 'invalid-response'
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('fails with a timeout when the deadline has passed', async () => {
		const fetchImpl = vi.fn(async () => response(techPayload));
		let clock = 1_000;
		const options = optionsWith(fetchImpl, {
			now: () => {
				clock += 40_000;
				return clock;
			}
		});

		await expect(Effect.runPromise(getPublicSubscribedTechsProgram([], options))).rejects.toMatchObject({
			_tag: 'WorkshopFallbackFailure',
			reason: 'timeout'
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
