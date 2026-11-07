import { useCallback, useEffect, useRef, useState } from 'react';
import api from 'renderer/Api';
import { readGameRunningCache } from 'renderer/game-status-cache';

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

	const setLaunchPending = useCallback((pending: boolean) => {
		overrideGameRunningRef.current = pending;
		setOverrideGameRunning(pending);
	}, []);

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

	const setGameRunningCallback = useCallback(
		(running: boolean) => {
			if (overrideGameRunningRef.current && running) {
				setLaunchPending(false);
			}
			setGameRunning(running);
		},
		[setLaunchPending]
	);

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
			const running = await readGameRunningCache({ forceReload: true });
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
		let cancelled = false;
		isCancelledRef.current = false;
		queueMicrotask(() => {
			if (!cancelled) void pollGameRunning();
		});

		return () => {
			cancelled = true;
			isCancelledRef.current = true;
			pollRequestIdRef.current += 1;
			clearGameRunningPoll();
			clearGameLaunchOverrideTimeout();
		};
	}, [clearGameLaunchOverrideTimeout, clearGameRunningPoll, pollGameRunning]);

	const beginLaunch = useCallback(() => {
		clearGameLaunchOverrideTimeout();
		setLaunchPending(true);
		void pollGameRunning();
	}, [clearGameLaunchOverrideTimeout, pollGameRunning, setLaunchPending]);

	const finishLaunch = useCallback(
		(success: boolean) => {
			clearGameLaunchOverrideTimeout();
			if (!success) {
				setLaunchPending(false);
				void pollGameRunning();
				return;
			}
			overrideTimeoutRef.current = setTimeout(() => {
				setLaunchPending(false);
				void pollGameRunning();
			}, GAME_RUNNING_POLL_INTERVAL_MS);
		},
		[clearGameLaunchOverrideTimeout, pollGameRunning, setLaunchPending]
	);

	return {
		effectiveGameRunning: gameRunning || overrideGameRunning,
		beginLaunch,
		finishLaunch
	};
}
