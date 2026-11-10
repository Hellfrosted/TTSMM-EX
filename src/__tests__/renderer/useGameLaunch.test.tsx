/// <reference path="../types/global.d.ts" />
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLaunch } from '../../renderer/hooks/collections/useGameLaunch';
import { createAppState } from './test-utils';

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(window.electron.isGameRunning).mockResolvedValue(false);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('useGameLaunch', () => {
	it('blocks another launch until process detection catches up or the grace period ends', async () => {
		vi.mocked(window.electron.launchGame).mockResolvedValue(true);
		const appState = createAppState();
		const { result } = renderHook(() => useGameLaunch({ appState, openNotification: vi.fn() }));
		let launch!: Promise<void>;
		act(() => {
			launch = result.current.launchMods([]);
		});
		expect(result.current.effectiveGameRunning).toBe(true);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
			await launch;
		});
		expect(window.electron.launchGame).toHaveBeenCalledWith(
			appState.config.gameExec,
			appState.config.workshopID.toString(),
			appState.config.closeOnLaunch,
			expect.any(Array)
		);
		expect(result.current.effectiveGameRunning).toBe(true);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});
		expect(result.current.effectiveGameRunning).toBe(false);
	});

	it.each([false, new Error('IPC unavailable')])('clears the running state and reports a failed launch: %s', async (outcome) => {
		if (outcome instanceof Error) vi.mocked(window.electron.launchGame).mockRejectedValueOnce(outcome);
		else vi.mocked(window.electron.launchGame).mockResolvedValueOnce(outcome);
		const appState = createAppState();
		const openNotification = vi.fn();
		const { result } = renderHook(() => useGameLaunch({ appState, openNotification }));
		await act(async () => {
			const launch = result.current.launchMods([]);
			await vi.advanceTimersByTimeAsync(1000);
			await launch;
		});
		expect(result.current.effectiveGameRunning).toBe(false);
		expect(appState.updateState).not.toHaveBeenCalledWith({ launchingGame: false });
		expect(openNotification).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('did not start') }), 'error');
		vi.mocked(window.electron.isGameRunning).mockResolvedValue(true);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});
		expect(result.current.effectiveGameRunning).toBe(true);
	});

	it('passes close-on-launch and pure vanilla settings to the Electron API', async () => {
		vi.mocked(window.electron.launchGame).mockResolvedValue(true);
		const appState = createAppState();
		appState.config = {
			...appState.config,
			gameExec: '/games/TerraTech.exe',
			workshopID: BigInt(2571814511),
			closeOnLaunch: true,
			pureVanilla: true
		};
		const { result } = renderHook(() => useGameLaunch({ appState, openNotification: vi.fn() }));
		await act(async () => {
			const launch = result.current.launchMods([
				{ uid: 'workshop:2571814511', id: 'ModManager', type: 'workshop', workshopID: BigInt(2571814511) }
			]);
			await vi.advanceTimersByTimeAsync(1000);
			await launch;
		});
		expect(window.electron.launchGame).toHaveBeenCalledWith('/games/TerraTech.exe', null, true, []);
	});
});
