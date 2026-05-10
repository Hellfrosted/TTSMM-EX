import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationViewport } from '../../renderer/components/NotificationViewport';
import { createNotificationEvent } from '../../renderer/notification-channel';

afterEach(() => {
	cleanup();
});

describe('NotificationViewport', () => {
	it('announces passive notifications with status and alert roles', async () => {
		render(<NotificationViewport />);

		window.dispatchEvent(
			createNotificationEvent({
				id: 'saved',
				type: 'success',
				props: {
					message: 'Collection saved',
					duration: null
				}
			})
		);
		window.dispatchEvent(
			createNotificationEvent({
				id: 'failed',
				type: 'error',
				props: {
					message: 'Could not save collection',
					duration: null
				}
			})
		);

		expect(await screen.findByRole('status')).toHaveTextContent('Collection saved');
		expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
		expect(screen.getByRole('alert')).toHaveTextContent('Could not save collection');
		expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
	});

	it('keeps clickable notifications operable while exposing live announcement metadata', async () => {
		render(<NotificationViewport />);

		window.dispatchEvent(
			createNotificationEvent({
				id: 'details',
				type: 'info',
				props: {
					message: 'Open validation details',
					duration: null,
					onClick: () => {}
				}
			})
		);

		const notification = await screen.findByRole('button', { name: /Open validation details/ });
		expect(notification).toHaveAttribute('aria-live', 'polite');
		expect(notification).toHaveAttribute('aria-atomic', 'true');
	});
});
