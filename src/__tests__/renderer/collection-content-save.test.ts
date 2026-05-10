import { describe, expect, it, vi } from 'vitest';
import type { ModCollection } from '../../model';
import { createCollectionWriteQueue, runCollectionContentSave } from '../../renderer/collection-content-save';

function createDeferred() {
	let resolveDeferred!: () => void;
	const promise = new Promise<void>((resolve) => {
		resolveDeferred = resolve;
	});
	return {
		promise,
		resolve: resolveDeferred
	};
}

describe('collection-content-save', () => {
	it('returns a completion event after a successful pure Collection Content Save', async () => {
		const collection: ModCollection = { name: 'default', mods: ['local:a'] };
		let persistedCollection: ModCollection | undefined;
		const persistCollectionFile = vi.fn(async (nextCollection: ModCollection) => {
			persistedCollection = { ...nextCollection, mods: [...nextCollection.mods] };
			nextCollection.mods.push('local:mutated');
			return { ok: true } as const;
		});

		const outcome = await runCollectionContentSave({
			collection,
			logger: { error: vi.fn() },
			persistCollectionFile,
			pureSave: true
		});

		expect(persistedCollection).toEqual({ name: 'default', mods: ['local:a'] });
		expect(collection.mods).toEqual(['local:a']);
		expect(outcome.completion).toEqual({
			pureSave: true,
			writeAccepted: true
		});
		expect(outcome).not.toHaveProperty('nextHasUnsavedDraft');
		expect(outcome.writeAccepted).toBe(true);
		expect(outcome.notification).toBeUndefined();
	});

	it('keeps dirty draft state after a non-pure save and can request success notification', async () => {
		const outcome = await runCollectionContentSave({
			collection: { name: 'default', mods: ['local:a'] },
			logger: { error: vi.fn() },
			persistCollectionFile: vi.fn(async () => ({ ok: true }) as const),
			pureSave: false,
			showSuccessNotification: true
		});

		expect(outcome.completion).toEqual({
			pureSave: false,
			writeAccepted: true
		});
		expect(outcome.notification).toEqual({
			props: {
				message: 'Saved collection default',
				placement: 'bottomRight',
				duration: 1
			},
			type: 'success'
		});
	});

	it('keeps dirty draft state and returns an error notification when persistence is rejected', async () => {
		const outcome = await runCollectionContentSave({
			collection: { name: 'default', mods: ['local:a'] },
			logger: { error: vi.fn() },
			persistCollectionFile: vi.fn(
				async () =>
					({
						ok: false,
						code: 'write-failed',
						message: 'Failed to save collection default'
					}) as const
			),
			pureSave: true
		});

		expect(outcome.completion).toEqual({
			pureSave: true,
			writeAccepted: false
		});
		expect(outcome.writeAccepted).toBe(false);
		expect(outcome.notification).toEqual({
			props: {
				message: 'Failed to save collection default',
				placement: 'bottomRight',
				duration: null
			},
			type: 'error'
		});
	});

	it('serializes queued collection writes', async () => {
		const queue = createCollectionWriteQueue();
		const firstRelease = createDeferred();
		const events: string[] = [];

		const first = queue.run(async () => {
			events.push('first-start');
			await firstRelease.promise;
			events.push('first-end');
			return 'first';
		});
		const second = queue.run(async () => {
			events.push('second-start');
			return 'second';
		});

		await Promise.resolve();
		expect(events).toEqual(['first-start']);

		firstRelease.resolve();
		await expect(first).resolves.toBe('first');
		await expect(second).resolves.toBe('second');
		expect(events).toEqual(['first-start', 'first-end', 'second-start']);
	});
});
