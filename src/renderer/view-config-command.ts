import { Effect } from 'effect';
import type { AppConfig, AppState, NotificationProps } from 'model';
import { useCallback } from 'react';
import api from 'renderer/Api';
import { type RendererElectron, runRenderer } from 'renderer/runtime';
import { persistConfigChangeProgram } from 'renderer/util/config-write';
import type { NotificationType } from './notification-channel';

interface PersistViewConfigChangeOptions {
	baseConfig?: AppConfig;
	logger: Pick<Console, 'error'>;
	nextConfig: AppConfig | undefined;
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	updateState: AppState['updateState'];
}

const persistViewConfigChangeProgram = Effect.fnUntraced(function* ({
	baseConfig,
	logger,
	nextConfig,
	openNotification,
	updateState
}: PersistViewConfigChangeOptions): Effect.fn.Return<boolean, never, RendererElectron> {
	return yield* persistConfigChangeProgram(nextConfig, (config) => updateState({ config }), baseConfig).pipe(
		Effect.catch((error) => {
			logger.error(error);
			openNotification(
				{
					message: 'Failed to update view settings',
					placement: 'bottomLeft',
					duration: null
				},
				'error'
			);
			return Effect.succeed(false);
		})
	);
});

export function persistViewConfigChange(options: PersistViewConfigChangeOptions) {
	return runRenderer(persistViewConfigChangeProgram(options));
}

export interface ViewConfigPersistenceOptions {
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
	updateState: AppState['updateState'];
}

export function useViewConfigPersistence({ openNotification, updateState }: ViewConfigPersistenceOptions) {
	return useCallback(
		(nextConfig: AppConfig | undefined, baseConfig: AppConfig) =>
			persistViewConfigChange({
				logger: api.logger,
				baseConfig,
				nextConfig,
				openNotification,
				updateState
			}),
		[openNotification, updateState]
	);
}
