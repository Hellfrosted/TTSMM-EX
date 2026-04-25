import { useCallback } from 'react';
import type { NotificationProps } from 'model';
import { APP_NOTIFICATION_EVENT, type AppNotificationEvent } from 'renderer/components/NotificationViewport';

export type NotificationType = 'info' | 'error' | 'success' | 'warn' | 'open';

export function useNotifications() {
	const openNotification = useCallback((props: NotificationProps, type: NotificationType = 'open') => {
		const id = props.key || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		window.dispatchEvent(
			new CustomEvent(APP_NOTIFICATION_EVENT, {
				detail: {
					id,
					props,
					type
				}
			}) as AppNotificationEvent
		);
	}, []);

	return {
		openNotification
	};
}
