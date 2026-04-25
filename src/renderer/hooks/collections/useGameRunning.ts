import { useCallback, useEffect, useRef, useState } from 'react';
import api from 'renderer/Api';

const GAME_RUNNING_POLL_INTERVAL_MS = 5000;

export function useGameRunning() {
	const [gameRunning, setGameRunning] = useState(false);
	const [overrideGameRunning, setOverrideGameRunning] = useState(false);
	const gameRunningPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const overrideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const isCancelledRef = useRef(false);
	const pollRequestIdRef = useRef(0);
	const overrideGameRunningRef = useRef(overrideGameRunning);
	const pollGameRunningRef = useRef<() => Promise<void>>(async () => undefined);

	useEffect(() => {
		overrideGameRunningRef.current = overrideGameRunning;
	}, [overrideGameRunning]);

	const clearGameRunningPoll = useCallback(() => {
		if (gameRunningPollTimeoutRef.current) {
			clearTimeout(gameRunningPollTimeoutRef.current);
			gameRunningPollTimeoutRef.current = undefined;
		}
	}, []);

	const clearGameLaunchOverrideTimeout = useCallback(() => {
		if (overrideTimeoutRef.current) {
			clearTimeout(overrideTimeoutRef.current);
			overrideTimeoutRef.current = undefined;
		}
	}, []);

	const setGameRunningCallback = useCallback((running: boolean) => {
		if (overrideGameRunningRef.current && running) {
			setOverrideGameRunning(false);
		}
		setGameRunning(running);
	}, []);

	const scheduleNextPoll = useCallback(() => {
		if (isCancelledRef.current) {
			return;
		}

		clearGameRunningPoll();
		gameRunningPollTimeoutRef.current = setTimeout(() => {
			void pollGameRunningRef.current();
		}, GAME_RUNNING_POLL_INTERVAL_MS);
	}, [clearGameRunningPoll]);

	const pollGameRunning = useCallback(async () => {
		if (isCancelledRef.current) {
			return;
		}

		const requestId = pollRequestIdRef.current + 1;
		pollRequestIdRef.current = requestId;

		try {
			const running = await api.gameRunning();
			if (isCancelledRef.current || requestId !== pollRequestIdRef.current) {
				return;
			}

			setGameRunningCallback(running);
		} catch (error) {
			if (requestId !== pollRequestIdRef.current) {
				return;
			}
			api.logger.error(error);
		} finally {
			if (!isCancelledRef.current && requestId === pollRequestIdRef.current) {
				scheduleNextPoll();
			}
		}
	}, [scheduleNextPoll, setGameRunningCallback]);

	useEffect(() => {
		pollGameRunningRef.current = pollGameRunning;
	}, [pollGameRunning]);

	useEffect(() => {
		queueMicrotask(() => {
			void pollGameRunning();
		});

		return () => {
			isCancelledRef.current = true;
			clearGameRunningPoll();
			clearGameLaunchOverrideTimeout();
		};
	}, [clearGameLaunchOverrideTimeout, clearGameRunningPoll, pollGameRunning]);

	const scheduleLaunchOverrideReset = useCallback(
		(callback?: () => void) => {
			clearGameLaunchOverrideTimeout();
			overrideTimeoutRef.current = setTimeout(() => {
				setOverrideGameRunning(false);
				callback?.();
			}, GAME_RUNNING_POLL_INTERVAL_MS);
		},
		[clearGameLaunchOverrideTimeout]
	);

	return {
		gameRunning,
		overrideGameRunning,
		setOverrideGameRunning,
		pollGameRunning,
		clearGameRunningPoll,
		clearGameLaunchOverrideTimeout,
		scheduleLaunchOverrideReset
	};
}
