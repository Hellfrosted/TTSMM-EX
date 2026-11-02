import { Effect } from 'effect';
import { SessionMods } from 'model';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { createCollectionValidationExecutor } from '../../renderer/collection-validation-executor';

const validateMock = vi.hoisted(() => vi.fn());
vi.mock('model', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../model')>()),
	validateCollection: validateMock
}));

describe('collection validation executor', () => {
	it('interrupts the actual Effect fiber when cancelled', async () => {
		let aborted = false;
		validateMock.mockImplementationOnce(() =>
			Effect.tryPromise({
				try: (signal) =>
					new Promise<Record<string, never>>((resolve) => {
						signal.addEventListener('abort', () => {
							aborted = true;
							resolve({});
						});
					}),
				catch: (error) => error
			})
		);
		const executor = createCollectionValidationExecutor({
			getContext: () => ({ config: DEFAULT_CONFIG, mods: new SessionMods('', []) }),
			openNotification: vi.fn()
		});
		const result = executor.validate({ name: 'default', mods: [] }, false);
		await vi.waitFor(() => expect(validateMock).toHaveBeenCalled());
		executor.cancel();
		expect(await result).toEqual({ type: 'cancelled' });
		expect(aborted).toBe(true);
	});
});
