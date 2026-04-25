import { useCallback, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { NotificationProps } from 'model';
import type { NotificationType } from 'renderer/hooks/collections/useNotifications';

export const APP_NOTIFICATION_EVENT = 'ttsmm:notification';

interface AppNotification {
	id: string;
	props: NotificationProps;
	type: NotificationType;
}

export type AppNotificationEvent = CustomEvent<AppNotification>;

function getNotificationTone(type: NotificationType) {
	switch (type) {
		case 'error':
			return 'error';
		case 'success':
			return 'success';
		case 'warn':
			return 'warning';
		default:
			return 'info';
	}
}

export function NotificationViewport() {
	const [notifications, setNotifications] = useState<AppNotification[]>([]);
	const closeNotification = useCallback((id: string) => {
		setNotifications((currentNotifications) => {
			const target = currentNotifications.find((notification) => notification.id === id);
			target?.props.onClose?.();
			return currentNotifications.filter((notification) => notification.id !== id);
		});
	}, []);

	useEffect(() => {
		const handleNotification = (event: Event) => {
			const notificationEvent = event as AppNotificationEvent;
			const nextNotification = notificationEvent.detail;
			setNotifications((currentNotifications) => {
				if (nextNotification.props.key) {
					return [
						...currentNotifications.filter((notification) => notification.props.key !== nextNotification.props.key),
						nextNotification
					];
				}
				return [...currentNotifications, nextNotification];
			});
		};

		window.addEventListener(APP_NOTIFICATION_EVENT, handleNotification);
		return () => {
			window.removeEventListener(APP_NOTIFICATION_EVENT, handleNotification);
		};
	}, []);

	useEffect(() => {
		const timeoutIds = notifications
			.filter((notification) => notification.props.duration !== null)
			.map((notification) => {
				const durationSeconds = notification.props.duration ?? 4.5;
				return window.setTimeout(() => {
					closeNotification(notification.id);
				}, durationSeconds * 1000);
			});

		return () => {
			timeoutIds.forEach((timeoutId) => {
				window.clearTimeout(timeoutId);
			});
		};
	}, [closeNotification, notifications]);

	const groupedNotifications = notifications.reduce<Record<string, AppNotification[]>>((acc, notification) => {
		const placement = notification.props.placement || 'topRight';
		acc[placement] = [...(acc[placement] || []), notification];
		return acc;
	}, {});

	return (
		<>
			{Object.entries(groupedNotifications).map(([placement, placementNotifications]) => (
				<div key={placement} className={`NotificationViewport NotificationViewport--${placement}`}>
					{placementNotifications.map((notification) => {
						const { props: notificationProps, type, id } = notification;
						const tone = getNotificationTone(type);
						const interactiveProps = notificationProps.onClick
							? {
									role: 'button',
									tabIndex: 0,
									onClick: notificationProps.onClick,
									onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											notificationProps.onClick?.();
										}
									}
								}
							: {};
						return (
							<div
								key={id}
								className={`NotificationToast NotificationToast--${tone}${notificationProps.className ? ` ${notificationProps.className}` : ''}`}
								style={{
									...notificationProps.style,
									top: notificationProps.top,
									bottom: notificationProps.bottom
								}}
								{...interactiveProps}
							>
								<div className="NotificationToast__body">
									<strong className="NotificationToast__title">{notificationProps.message}</strong>
									{notificationProps.description ? (
										<div className="NotificationToast__description">{notificationProps.description}</div>
									) : null}
									{notificationProps.btn ? <div className="NotificationToast__actions">{notificationProps.btn}</div> : null}
								</div>
								<button
									type="button"
									className="NotificationToast__close"
									aria-label="Close notification"
									onClick={(event) => {
										event.stopPropagation();
										closeNotification(id);
									}}
								>
									{notificationProps.closeIcon || <X size={16} aria-hidden="true" />}
								</button>
							</div>
						);
					})}
				</div>
			))}
		</>
	);
}
