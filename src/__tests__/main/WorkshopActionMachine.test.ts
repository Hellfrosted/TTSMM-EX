import { describe, expect, it } from 'vitest';
import { idleWorkshopActionState, reduceWorkshopAction } from '../../main/workshop-action-machine';

const start = (hasLateSuccess = false) => reduceWorkshopAction(idleWorkshopActionState, { type: 'start', hasLateSuccess });

describe('workshop action machine', () => {
	it('holds the key while an action is pending', () => {
		const { state, effects } = start();

		expect(state.phase).toBe('pending');
		expect(effects.releaseKey).toBe(false);
		expect(effects.resume).toBeNull();
	});

	it('resumes false on timeout but keeps holding the key until the callback', () => {
		const pending = start().state;
		const { state, effects } = reduceWorkshopAction(pending, { type: 'timeout' });

		expect(state.phase).toBe('timed-out');
		expect(effects.resume).toBe(false);
		expect(effects.releaseKey).toBe(false);
	});

	it('releases the key and resumes with the callback result', () => {
		const pending = start().state;

		expect(reduceWorkshopAction(pending, { type: 'callback', ok: true }).effects).toMatchObject({
			releaseKey: true,
			clearTimeout: true,
			resume: true
		});
		expect(reduceWorkshopAction(pending, { type: 'callback', ok: false }).effects.resume).toBe(false);
	});

	it('runs a late success once and settles the action', () => {
		const pending = start(true).state;
		const timedOut = reduceWorkshopAction(pending, { type: 'timeout' }).state;

		const late = reduceWorkshopAction(timedOut, { type: 'callback', ok: true });
		expect(late.state.phase).toBe('settled');
		expect(late.effects.runLateSuccess).toBe(true);
		expect(late.effects.releaseKey).toBe(false);
		expect(late.effects.releaseKeyAfterLateSuccess).toBe(true);
		expect(late.effects.resume).toBeNull();
		expect(reduceWorkshopAction(late.state, { type: 'callback', ok: true }).effects).toMatchObject({
			releaseKey: false,
			runLateSuccess: false
		});
	});

	it('settles a thrown action and ignores later events', () => {
		const pending = start().state;
		const thrown = reduceWorkshopAction(pending, { type: 'threw' });

		expect(thrown.state.phase).toBe('settled');
		expect(thrown.effects).toMatchObject({ releaseKey: true, clearTimeout: true, resume: false });
		expect(reduceWorkshopAction(thrown.state, { type: 'timeout' }).state.phase).toBe('settled');
	});
});
