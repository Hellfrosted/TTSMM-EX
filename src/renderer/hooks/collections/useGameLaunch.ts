import { Effect } from 'effect';
import type { ModData, NotificationProps } from 'model';
import { useCallback, useEffect, useRef, useState } from 'react';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { pauseEffect } from 'util/Sleep';
import { useGameRunning } from './useGameRunning';
import type { NotificationType } from './useNotifications';

interface UseGameLaunchOptions {
	appState: CollectionWorkspaceAppState;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
}

export function useGameLaunch({ appState, openNotification }: UseGameLaunchOptions) {
	const { effectiveGameRunning, beginLaunch, finishLaunch } = useGameRunning();
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
			const { config } = appState;

			api.logger.info('launching game');
			beginLaunch();

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
				).catch((error: unknown) => {
					api.logger.error(error);
					return false;
				});

				if (launchRequestRef.current !== requestId) {
					return;
				}

				if (!success) {
					finishLaunch(false);
					openNotification(
						{
							message: 'Game launch did not start. Check the configured executable and Steam state, then try again.',
							placement: 'bottomRight',
							duration: null
						},
						'error'
					);
					return;
				}

				finishLaunch(true);
			} finally {
				if (launchRequestRef.current === requestId) {
					setLaunchGameWithErrors(false);
				}
			}
		},
		[appState, beginLaunch, finishLaunch, openNotification]
	);

	return {
		effectiveGameRunning,
		launchGameWithErrors,
		setLaunchGameWithErrors,
		launchMods
	};
}
