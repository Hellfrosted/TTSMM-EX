import { describe, expect, it } from 'vitest';
import { appReducer, mergeAppState, setActiveCollection } from '../../renderer/state/app-state';
import { createAppState } from './test-utils';

describe('app state reducer', () => {
	it('updates reducer-owned app state through explicit actions', () => {
		const initialState = createAppState();
		const collection = { name: 'default', mods: [] };

		const mergedState = appReducer(initialState, mergeAppState({ sidebarCollapsed: false, launchingGame: true }));
		const finalState = appReducer(mergedState, setActiveCollection(collection));

		expect(finalState.sidebarCollapsed).toBe(false);
		expect(finalState.launchingGame).toBe(true);
		expect(finalState.activeCollection).toEqual(collection);
	});
});
