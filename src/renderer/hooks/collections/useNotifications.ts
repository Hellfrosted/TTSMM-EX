import { useCallback } from 'react';
import type { NotificationProps } from 'model';
import { createNotificationEvent, type NotificationType } from 'renderer/notification-channel';

export type { NotificationType } from 'renderer/notification-channel';

export function useNotifications() {
	const openNotification = useCallback((props: NotificationProps, type: NotificationType = 'open') => {
		const id = props.key || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		window.dispatchEvent(createNotificationEvent({ id, props, type }));
	}, []);

	return {
		openNotification
	};
}
