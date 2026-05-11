import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods } from '../../model';
import { useCollectionWorkspace } from '../../renderer/views/use-collection-workspace';
import { createAppState, createTestWrapper } from './test-utils';

afterEach(() => {
	cleanup();
});

describe('useCollectionWorkspace', () => {
	it.each(['dependencies', 'inspect'])('keeps the %s details tab active when opening another mod', async (tabKey) => {
		const rows = [
			{
				uid: 'workshop:1',
				type: ModType.WORKSHOP,
				workshopID: BigInt(1),
				id: 'FirstMod',
				name: 'First Mod',
				subscribed: true,
				installed: true
			},
			{
				uid: 'workshop:2',
				type: ModType.WORKSHOP,
				workshopID: BigInt(2),
				id: 'SecondMod',
				name: 'Second Mod',
				subscribed: true,
				installed: true
			}
		];
		const activeCollection = { name: 'default', mods: rows.map((row) => row.uid) };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([[activeCollection.name, activeCollection]]),
			allCollectionNames: new Set([activeCollection.name]),
			mods: new SessionMods('', rows)
		});

		const { result } = renderHook(() => useCollectionWorkspace({ appState, openNotification: vi.fn() }), {
			wrapper: createTestWrapper()
		});

		act(() => {
			result.current.getModDetails(rows[0].uid, rows[0]);
		});
		await waitFor(() => {
			expect(result.current.currentRecord?.uid).toBe(rows[0].uid);
		});

		act(() => {
			result.current.setDetailsActiveTabKey(tabKey);
		});
		await waitFor(() => {
			expect(result.current.detailsActiveTabKey).toBe(tabKey);
		});

		act(() => {
			result.current.getModDetails(rows[1].uid, rows[1]);
		});

		await waitFor(() => {
			expect(result.current.currentRecord?.uid).toBe(rows[1].uid);
			expect(result.current.detailsActiveTabKey).toBe(tabKey);
		});
	});
});
