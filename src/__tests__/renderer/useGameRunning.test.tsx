import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameRunning } from '../../renderer/hooks/collections/useGameRunning';

describe('useGameRunning', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('continues polling after an initial false result', async () => {
		vi.mocked(window.electron.isGameRunning)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false);

		renderHook(() => useGameRunning());

		await act(async () => {
			await Promise.resolve();
		});
		expect(window.electron.isGameRunning).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(window.electron.isGameRunning).toHaveBeenCalledTimes(2);
	});

	it('ignores stale poll results when a newer request resolves first', async () => {
		const resolvers: Array<(value: boolean) => void> = [];
		vi.mocked(window.electron.isGameRunning).mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					resolvers.push(resolve);
				})
		);

		const { result } = renderHook(() => useGameRunning());

		await act(async () => {
			await Promise.resolve();
		});
		expect(window.electron.isGameRunning).toHaveBeenCalledTimes(1);

		await act(async () => {
			void result.current.pollGameRunning();
			await Promise.resolve();
		});

		expect(window.electron.isGameRunning).toHaveBeenCalledTimes(2);

		await act(async () => {
			resolvers[1]?.(true);
			await Promise.resolve();
		});

		expect(result.current.gameRunning).toBe(true);

		await act(async () => {
			resolvers[0]?.(false);
			await Promise.resolve();
		});

		expect(result.current.gameRunning).toBe(true);
	});
});
