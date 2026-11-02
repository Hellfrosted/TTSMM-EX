import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationViewport } from '../../renderer/components/NotificationViewport';
import { createNotificationEvent } from '../../renderer/notification-channel';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('NotificationViewport', () => {
	it('restarts the dismissal timer when a notification is replaced', () => {
		vi.useFakeTimers();
		render(<NotificationViewport />);
		act(() =>
			window.dispatchEvent(createNotificationEvent({ id: 'timed', type: 'info', props: { key: 'same', message: 'First', duration: 1 } }))
		);
		act(() => vi.advanceTimersByTime(500));
		act(() =>
			window.dispatchEvent(createNotificationEvent({ id: 'timed', type: 'info', props: { key: 'same', message: 'Updated', duration: 2 } }))
		);
		act(() => vi.advanceTimersByTime(600));
		expect(screen.getByText('Updated')).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(1600));
		expect(screen.queryByText('Updated')).not.toBeInTheDocument();
	});
	it('clears notification timers on unmount', () => {
		vi.useFakeTimers();
		const onClose = vi.fn();
		const { unmount } = render(<NotificationViewport />);
		act(() => {
			window.dispatchEvent(createNotificationEvent({ id: 'timed', type: 'info', props: { message: 'Timed', duration: 1, onClose } }));
		});
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		unmount();
		expect(vi.getTimerCount()).toBe(0);
		act(() => vi.runAllTimers());
		expect(onClose).not.toHaveBeenCalled();
	});
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
