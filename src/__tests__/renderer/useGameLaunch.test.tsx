/// <reference path="../types/global.d.ts" />
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameLaunch } from '../../renderer/hooks/collections/useGameLaunch';
import { createAppState } from './test-utils';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('useGameLaunch', () => {
	it('keeps the API receiver when launching after the delay', async () => {
		vi.useFakeTimers();
		vi.mocked(window.electron.launchGame).mockResolvedValue(true);
		const appState = createAppState();
		const pollGameRunning = vi.fn(async () => undefined);
		const scheduleLaunchOverrideReset = vi.fn();

		const { result } = renderHook(() =>
			useGameLaunch({
				appState,
				clearGameLaunchOverrideTimeout: vi.fn(),
				clearGameRunningPoll: vi.fn(),
				openNotification: vi.fn(),
				pollGameRunning,
				scheduleLaunchOverrideReset,
				setOverrideGameRunning: vi.fn()
			})
		);

		await act(async () => {
			const launchPromise = result.current.launchMods([]);
			await vi.advanceTimersByTimeAsync(1000);
			await launchPromise;
		});

		expect(window.electron.launchGame).toHaveBeenCalledWith(
			appState.config.gameExec,
			appState.config.workshopID.toString(),
			appState.config.closeOnLaunch,
			expect.any(Array)
		);
		expect(scheduleLaunchOverrideReset).toHaveBeenCalled();
	});

	it('clears launch state and reports a failed launch', async () => {
		vi.useFakeTimers();
		vi.mocked(window.electron.launchGame).mockResolvedValue(false);
		const appState = createAppState();
		const clearGameLaunchOverrideTimeout = vi.fn();
		const clearGameRunningPoll = vi.fn();
		const openNotification = vi.fn();
		const pollGameRunning = vi.fn(async () => undefined);
		const scheduleLaunchOverrideReset = vi.fn();
		const setOverrideGameRunning = vi.fn();

		const { result } = renderHook(() =>
			useGameLaunch({
				appState,
				clearGameLaunchOverrideTimeout,
				clearGameRunningPoll,
				openNotification,
				pollGameRunning,
				scheduleLaunchOverrideReset,
				setOverrideGameRunning
			})
		);

		await act(async () => {
			const launchPromise = result.current.launchMods([]);
			await vi.advanceTimersByTimeAsync(1000);
			await launchPromise;
		});

		expect(appState.updateState).toHaveBeenCalledWith({ launchingGame: true });
		expect(appState.updateState).toHaveBeenLastCalledWith({ launchingGame: false });
		expect(pollGameRunning).toHaveBeenCalledOnce();
		expect(clearGameRunningPoll).toHaveBeenCalledOnce();
		expect(clearGameLaunchOverrideTimeout).toHaveBeenCalledOnce();
		expect(openNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Game launch did not start. Check the configured executable and Steam state, then try again.',
				duration: null
			}),
			'error'
		);
		expect(setOverrideGameRunning).toHaveBeenCalledWith(true);
		expect(setOverrideGameRunning).toHaveBeenLastCalledWith(false);
		expect(scheduleLaunchOverrideReset).not.toHaveBeenCalled();
	});

	it('passes close-on-launch and pure vanilla launch settings to the Electron API', async () => {
		vi.useFakeTimers();
		vi.mocked(window.electron.launchGame).mockResolvedValue(true);
		const appState = createAppState();
		appState.config = {
			...appState.config,
			gameExec: '/games/TerraTech.exe',
			workshopID: BigInt(2571814511),
			closeOnLaunch: true,
			pureVanilla: true
		};
		const pollGameRunning = vi.fn(async () => undefined);

		const { result } = renderHook(() =>
			useGameLaunch({
				appState,
				clearGameLaunchOverrideTimeout: vi.fn(),
				clearGameRunningPoll: vi.fn(),
				openNotification: vi.fn(),
				pollGameRunning,
				scheduleLaunchOverrideReset: vi.fn(),
				setOverrideGameRunning: vi.fn()
			})
		);

		await act(async () => {
			const launchPromise = result.current.launchMods([
				{
					uid: 'workshop:2571814511',
					id: 'ModManager',
					type: 'workshop',
					workshopID: BigInt(2571814511)
				}
			]);
			await vi.advanceTimersByTimeAsync(1000);
			await launchPromise;
		});

		expect(window.electron.launchGame).toHaveBeenCalledWith('/games/TerraTech.exe', null, true, []);
		expect(pollGameRunning).toHaveBeenCalledOnce();
	});
});
