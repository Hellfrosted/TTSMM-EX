import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import { createAppState, createTestWrapper } from './test-utils';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('useCollectionWorkspace', () => {
	it('launches with mod data projected from the Active Collection Draft', async () => {
		const { useCollectionWorkspaceSession } = await import('../../renderer/hooks/collections/useCollectionWorkspaceSession');
		const rows = [
			{
				uid: 'local:a',
				type: ModType.LOCAL,
				id: 'LocalA',
				name: 'Local A',
				path: '/mods/a'
			},
			{
				uid: 'local:b',
				type: ModType.LOCAL,
				id: 'LocalB',
				name: 'Local B',
				path: '/mods/b'
			}
		];
		const activeCollection = { name: 'default', mods: rows.map((row) => row.uid) };
		const mods = new SessionMods('', rows);
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([[activeCollection.name, activeCollection]]),
			allCollectionNames: new Set([activeCollection.name]),
			mods
		});
		setupDescriptors(mods, appState.config.userOverrides);
		const launchMods = vi.fn(async () => undefined);

		const { result } = renderHook(
			() =>
				useCollectionWorkspaceSession({
					appState,
					gameRunning: false,
					launchMods,
					modalOpen: false,
					openNotification: vi.fn(),
					overrideGameRunning: false,
					setModalType: vi.fn()
				}),
			{ wrapper: createTestWrapper() }
		);

		act(() => {
			result.current.validateCollection();
		});

		await waitFor(() => {
			expect(result.current.collectionWorkspaceSession.validationStatus).toBe('passed');
		});

		await act(async () => {
			await result.current.launchGame();
		});

		await waitFor(() => {
			expect(launchMods).toHaveBeenCalledWith(rows);
		});
	});

	it('treats launch override as a running-game launch blocker', async () => {
		const { useCollectionWorkspace } = await import('../../renderer/views/use-collection-workspace');
		vi.mocked(window.electron.isGameRunning).mockResolvedValue(false);
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([[activeCollection.name, activeCollection]]),
			allCollectionNames: new Set([activeCollection.name]),
			mods: new SessionMods('', [])
		});

		const { result } = renderHook(() => useCollectionWorkspace({ appState, openNotification: vi.fn() }), {
			wrapper: createTestWrapper()
		});

		act(() => {
			result.current.setOverrideGameRunning(true);
		});

		expect(result.current.overrideGameRunning).toBe(true);
		expect(result.current.collectionWorkspaceSession.launchReadiness.blockers).toContain('game-running');
		result.current.clearGameRunningPoll();
		result.current.clearGameLaunchOverrideTimeout();
	});

	it.each(['dependencies', 'inspect'])('keeps the %s details tab active when opening another mod', async (tabKey) => {
		const { useCollectionWorkspace } = await import('../../renderer/views/use-collection-workspace');
		vi.useFakeTimers();
		vi.mocked(window.electron.isGameRunning).mockResolvedValue(false);
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
		const openNotification = vi.fn();

		const { result } = renderHook(() => useCollectionWorkspace({ appState, openNotification }), {
			wrapper: createTestWrapper()
		});

		act(() => {
			result.current.getModDetails(rows[0].uid, rows[0]);
		});
		expect(result.current.currentRecord?.uid).toBe(rows[0].uid);

		act(() => {
			result.current.setDetailsActiveTabKey(tabKey);
		});
		expect(result.current.detailsActiveTabKey).toBe(tabKey);

		act(() => {
			result.current.getModDetails(rows[1].uid, rows[1]);
		});

		expect(result.current.currentRecord?.uid).toBe(rows[1].uid);
		expect(result.current.detailsActiveTabKey).toBe(tabKey);
		result.current.clearGameRunningPoll();
		result.current.clearGameLaunchOverrideTimeout();
	});
});
