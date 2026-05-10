import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import {
	APP_NOTIFICATION_EVENT,
	type AppNotification,
	type AppNotificationEvent,
	type NotificationType
} from 'renderer/notification-channel';
import { getStatusSurfaceClassName } from './status-surface-classes';

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

function getViewportClassName(placement: string) {
	const placementClassName =
		placement === 'topLeft'
			? 'left-[18px] top-[18px]'
			: placement === 'bottomRight'
				? 'bottom-[18px] right-[18px]'
				: placement === 'bottomLeft'
					? 'bottom-[18px] left-[18px]'
					: 'right-[18px] top-[18px]';

	return ['pointer-events-none fixed z-[2000] flex w-[min(360px,calc(100vw_-_32px))] flex-col gap-2.5', placementClassName].join(' ');
}

function getToastClassName(tone: ReturnType<typeof getNotificationTone>, className?: string) {
	const toneClassName = getStatusSurfaceClassName(tone);

	return [
		'NotificationToast pointer-events-auto grid grid-cols-[minmax(0,1fr)_28px] gap-2.5 rounded-sm border p-3 text-text shadow-[0_8px_18px_color-mix(in_srgb,var(--app-color-background)_76%,transparent)]',
		toneClassName,
		className
	]
		.filter(Boolean)
		.join(' ');
}

function getAnnouncementProps(type: NotificationType, interactive: boolean) {
	const liveProps = {
		'aria-atomic': true,
		'aria-live': type === 'error' ? 'assertive' : 'polite'
	} as const;

	if (interactive) {
		return liveProps;
	}

	return {
		...liveProps,
		role: type === 'error' ? 'alert' : 'status'
	} as const;
}

type NotificationAction =
	| {
			notification: AppNotification;
			type: 'add';
	  }
	| {
			id: string;
			type: 'close';
	  }
	| {
			id: string;
			type: 'remove';
	  };

type RenderedNotification = AppNotification & {
	renderState: 'closing' | 'open';
};

function reduceNotifications(notifications: RenderedNotification[], action: NotificationAction) {
	switch (action.type) {
		case 'add': {
			const nextNotification: RenderedNotification = { ...action.notification, renderState: 'open' };
			if (nextNotification.props.key) {
				return [...notifications.filter((notification) => notification.props.key !== nextNotification.props.key), nextNotification];
			}
			return [...notifications, nextNotification];
		}
		case 'close':
			return notifications.map((notification) =>
				notification.id === action.id ? { ...notification, renderState: 'closing' as const } : notification
			);
		case 'remove':
			return notifications.filter((notification) => notification.id !== action.id);
	}
}

export function NotificationViewport() {
	const [notifications, dispatchNotifications] = useReducer(reduceNotifications, []);
	const closingIdsRef = useRef(new Set<string>());
	const closeTimersRef = useRef(new Map<string, number>());
	const clearCloseState = useCallback((id: string) => {
		const timeoutId = closeTimersRef.current.get(id);
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
			closeTimersRef.current.delete(id);
		}
		closingIdsRef.current.delete(id);
	}, []);
	const closeNotification = useCallback(
		(id: string) => {
			const target = notifications.find((notification) => notification.id === id);
			if (!target || closingIdsRef.current.has(id)) {
				return;
			}

			closingIdsRef.current.add(id);
			target?.props.onClose?.();
			dispatchNotifications({ type: 'close', id });
			const timeoutId = window.setTimeout(() => {
				closeTimersRef.current.delete(id);
				if (!closingIdsRef.current.delete(id)) {
					return;
				}
				dispatchNotifications({ type: 'remove', id });
			}, 180);
			closeTimersRef.current.set(id, timeoutId);
		},
		[notifications]
	);

	useEffect(() => {
		const handleNotification = (event: Event) => {
			const notificationEvent = event as AppNotificationEvent;
			clearCloseState(notificationEvent.detail.id);
			dispatchNotifications({ type: 'add', notification: notificationEvent.detail });
		};

		window.addEventListener(APP_NOTIFICATION_EVENT, handleNotification);
		return () => {
			window.removeEventListener(APP_NOTIFICATION_EVENT, handleNotification);
		};
	}, [clearCloseState]);

	useEffect(() => {
		return () => {
			closeTimersRef.current.forEach((timeoutId) => {
				window.clearTimeout(timeoutId);
			});
			closeTimersRef.current.clear();
			closingIdsRef.current.clear();
		};
	}, []);

	useEffect(() => {
		const timeoutIds = notifications.reduce<number[]>((ids, notification) => {
			if (notification.renderState === 'closing' || notification.props.duration === null) {
				return ids;
			}
			const durationSeconds = notification.props.duration ?? 4.5;
			ids.push(
				window.setTimeout(() => {
					closeNotification(notification.id);
				}, durationSeconds * 1000)
			);
			return ids;
		}, []);

		return () => {
			timeoutIds.forEach((timeoutId) => {
				window.clearTimeout(timeoutId);
			});
		};
	}, [closeNotification, notifications]);

	const groupedNotifications = notifications.reduce<Record<string, RenderedNotification[]>>((acc, notification) => {
		const placement = notification.props.placement || 'topRight';
		acc[placement] = [...(acc[placement] || []), notification];
		return acc;
	}, {});

	return (
		<>
			{Object.entries(groupedNotifications).map(([placement, placementNotifications]) => (
				<div key={placement} className={getViewportClassName(placement)}>
					{placementNotifications.map((notification) => {
						const { props: notificationProps, type, id } = notification;
						const tone = getNotificationTone(type);
						const notificationInteractive = !!notificationProps.onClick;
						const announcementProps = getAnnouncementProps(type, notificationInteractive);
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
								className={getToastClassName(tone, notificationProps.className)}
								data-placement={placement}
								data-state={notification.renderState}
								style={{
									...notificationProps.style,
									top: notificationProps.top,
									bottom: notificationProps.bottom
								}}
								{...announcementProps}
								{...interactiveProps}
							>
								<div className="min-w-0">
									<strong className="block wrap-break-word leading-[1.35]">{notificationProps.message}</strong>
									{notificationProps.description ? (
										<div className="mt-1 block wrap-break-word leading-[1.35] text-text-muted">{notificationProps.description}</div>
									) : null}
									{notificationProps.btn ? <div className="mt-2.5">{notificationProps.btn}</div> : null}
								</div>
								<button
									type="button"
									className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] hover:text-text focus-visible:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] focus-visible:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--app-color-text-base)_78%,var(--app-color-primary)_22%)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
