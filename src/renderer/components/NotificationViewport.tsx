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
	const toneClassName =
		tone === 'error'
			? 'border-[color-mix(in_srgb,var(--app-color-error)_40%,var(--app-color-border))] bg-[color-mix(in_srgb,var(--app-color-error)_18%,var(--app-color-surface-alt))]'
			: tone === 'warning'
				? 'border-[color-mix(in_srgb,var(--app-color-warning)_38%,var(--app-color-border))] bg-[color-mix(in_srgb,var(--app-color-warning)_16%,var(--app-color-surface-alt))]'
				: tone === 'success'
					? 'border-[color-mix(in_srgb,var(--app-color-success)_42%,var(--app-color-border))] bg-surface-elevated'
					: 'border-border bg-surface-elevated';

	return [
		'pointer-events-auto grid grid-cols-[minmax(0,1fr)_28px] gap-2.5 rounded-md border p-3 text-text shadow-[0_14px_32px_color-mix(in_srgb,var(--app-color-background)_72%,transparent)]',
		toneClassName,
		className
	]
		.filter(Boolean)
		.join(' ');
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
				<div key={placement} className={getViewportClassName(placement)}>
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
								className={getToastClassName(tone, notificationProps.className)}
								style={{
									...notificationProps.style,
									top: notificationProps.top,
									bottom: notificationProps.bottom
								}}
								{...interactiveProps}
							>
								<div className="min-w-0">
									<strong className="block break-words leading-[1.35]">{notificationProps.message}</strong>
									{notificationProps.description ? (
										<div className="mt-1 block break-words leading-[1.35] text-text-muted">{notificationProps.description}</div>
									) : null}
									{notificationProps.btn ? <div className="mt-2.5">{notificationProps.btn}</div> : null}
								</div>
								<button
									type="button"
									className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted hover:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] hover:text-text focus-visible:bg-[color-mix(in_srgb,var(--app-color-text-base)_4%,transparent)] focus-visible:text-text focus-visible:outline-none"
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
