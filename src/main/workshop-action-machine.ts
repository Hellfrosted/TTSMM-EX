/**
 * Explicit state machine for one Steamworks action.
 *
 * The side effects stay outside: this reducer only decides what the caller
 * should do next. The phases mirror the existing `runSteamworksAction`
 * behavior, including holding the action key after a timeout until the native
 * callback arrives.
 */

export type WorkshopActionPhase = 'idle' | 'pending' | 'timed-out' | 'settled';

export interface WorkshopActionState {
	readonly phase: WorkshopActionPhase;
	readonly hasLateSuccess: boolean;
}

export type WorkshopActionEvent =
	| { readonly type: 'start'; readonly hasLateSuccess: boolean }
	| { readonly type: 'timeout' }
	| { readonly type: 'callback'; readonly ok: boolean }
	| { readonly type: 'threw' };

export interface WorkshopActionEffects {
	/** Release the single-flight key for this action. */
	readonly releaseKey: boolean;
	/** Keep the key until a late-success reconciliation finishes. */
	readonly releaseKeyAfterLateSuccess: boolean;
	/** Clear the timeout handle. */
	readonly clearTimeout: boolean;
	/** `null` means do not resume the Effect. */
	readonly resume: boolean | null;
	/** A success that arrived after the deadline. */
	readonly runLateSuccess: boolean;
}

export const idleWorkshopActionState: WorkshopActionState = { phase: 'idle', hasLateSuccess: false };

const noEffects: WorkshopActionEffects = {
	releaseKey: false,
	releaseKeyAfterLateSuccess: false,
	clearTimeout: false,
	resume: null,
	runLateSuccess: false
};

export function reduceWorkshopAction(
	state: WorkshopActionState,
	event: WorkshopActionEvent
): {
	state: WorkshopActionState;
	effects: WorkshopActionEffects;
} {
	if (state.phase === 'settled' || (event.type !== 'start' && state.phase === 'idle')) {
		return { state, effects: noEffects };
	}

	if (event.type === 'start') {
		return {
			state: { phase: 'pending', hasLateSuccess: event.hasLateSuccess },
			effects: noEffects
		};
	}

	if (state.phase === 'pending') {
		switch (event.type) {
			case 'timeout':
				return {
					state: { phase: 'timed-out', hasLateSuccess: state.hasLateSuccess },
					effects: { ...noEffects, resume: false }
				};
			case 'callback':
				return {
					state: { phase: 'settled', hasLateSuccess: state.hasLateSuccess },
					effects: { ...noEffects, releaseKey: true, clearTimeout: true, resume: event.ok }
				};
			case 'threw':
				return {
					state: { phase: 'settled', hasLateSuccess: state.hasLateSuccess },
					effects: { ...noEffects, releaseKey: true, clearTimeout: true, resume: false }
				};
		}
	}

	switch (event.type) {
		case 'callback': {
			const runLateSuccess = event.ok && state.hasLateSuccess;
			return {
				state: { phase: 'settled', hasLateSuccess: state.hasLateSuccess },
				effects: {
					...noEffects,
					releaseKey: !runLateSuccess,
					releaseKeyAfterLateSuccess: runLateSuccess,
					runLateSuccess
				}
			};
		}
		case 'threw':
			return {
				state: { phase: 'settled', hasLateSuccess: state.hasLateSuccess },
				effects: { ...noEffects, releaseKey: true }
			};
		default:
			return { state, effects: noEffects };
	}
}
