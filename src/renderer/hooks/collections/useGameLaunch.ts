import { Effect } from 'effect';
import type { ModData, NotificationProps } from 'model';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { pauseEffect } from 'util/Sleep';
import type { NotificationType } from './useNotifications';

interface UseGameLaunchOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	pollGameRunning: () => Promise<void>;
	clearGameRunningPoll: () => void;
	clearGameLaunchOverrideTimeout: () => void;
	scheduleLaunchOverrideReset: (callback?: () => void) => void;
	setOverrideGameRunning: (override: boolean) => void;
}

export function useGameLaunch({
	appState,
	openNotification,
	pollGameRunning,
	clearGameRunningPoll,
	clearGameLaunchOverrideTimeout,
	scheduleLaunchOverrideReset,
	setOverrideGameRunning
}: UseGameLaunchOptions) {
	const [launchGameWithErrors, setLaunchGameWithErrors] = useState(false);
	const launchRequestRef = useRef(0);

	useEffect(() => {
		return () => {
			launchRequestRef.current += 1;
		};
	}, []);

	const launchMods = useCallback(
		async (mods: ModData[]) => {
			const requestId = launchRequestRef.current + 1;
			launchRequestRef.current = requestId;
			const { config, updateState } = appState;

			api.logger.info('launching game');
			updateState({ launchingGame: true });
			setOverrideGameRunning(true);
			void pollGameRunning();

			try {
				const success = await Effect.runPromise(
					pauseEffect(1000, () =>
						api.launchGame(
							config.gameExec,
							config.workshopID,
							config.closeOnLaunch,
							mods,
							config.pureVanilla,
							config.logParams,
							config.extraParams
						)
					)
				);

				if (launchRequestRef.current !== requestId) {
					return;
				}

				if (!success) {
					clearGameRunningPoll();
					clearGameLaunchOverrideTimeout();
					openNotification(
						{
							message: 'Game launch did not start. Check the configured executable and Steam state, then try again.',
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
					setOverrideGameRunning(false);
					return;
				}

				scheduleLaunchOverrideReset(() => {
					void pollGameRunning();
				});
			} finally {
				if (launchRequestRef.current === requestId) {
					updateState({ launchingGame: false });
					setLaunchGameWithErrors(false);
				}
			}
		},
		[
			appState,
			clearGameLaunchOverrideTimeout,
			clearGameRunningPoll,
			openNotification,
			pollGameRunning,
			scheduleLaunchOverrideReset,
			setOverrideGameRunning
		]
	);

	return {
		launchGameWithErrors,
		setLaunchGameWithErrors,
		launchMods
	};
}
