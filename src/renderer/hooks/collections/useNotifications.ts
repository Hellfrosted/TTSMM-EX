import { useCallback } from 'react';
import { App as AntApp } from 'antd';
import type { NotificationProps } from 'model';

export type NotificationType = 'info' | 'error' | 'success' | 'warn' | 'open';

export function useNotifications() {
	const { notification } = AntApp.useApp();

	const openNotification = useCallback((props: NotificationProps, type: NotificationType = 'open') => {
		const duration: number | false = props.duration === null ? false : props.duration;
		const normalizedProps = {
			description: props.description,
			duration,
			placement: props.placement,
			className: props.className,
			closeIcon: props.closeIcon,
			key: props.key,
			style: props.style,
			onClick: props.onClick,
			onClose: props.onClose,
			top: props.top,
			bottom: props.bottom,
			title: props.message,
			actions: props.btn
		};

		switch (type) {
			case 'error':
				notification.error(normalizedProps);
				break;
			case 'info':
				notification.info(normalizedProps);
				break;
			case 'success':
				notification.success(normalizedProps);
				break;
			case 'warn':
				notification.warning(normalizedProps);
				break;
			default:
				notification.open(normalizedProps);
				break;
		}
	}, [notification]);

	return {
		openNotification
	};
}
