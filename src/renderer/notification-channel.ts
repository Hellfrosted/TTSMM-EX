import type { NotificationProps } from 'model';

export const APP_NOTIFICATION_EVENT = 'ttsmm:notification';

export type NotificationType = 'info' | 'error' | 'success' | 'warn' | 'open';

export interface AppNotification {
	id: string;
	props: NotificationProps;
	type: NotificationType;
}

export type AppNotificationEvent = CustomEvent<AppNotification>;

export function createNotificationEvent(notification: AppNotification): AppNotificationEvent {
	return new CustomEvent(APP_NOTIFICATION_EVENT, {
		detail: notification
	}) as AppNotificationEvent;
}
