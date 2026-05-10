import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopButton, DesktopDialog } from '../../renderer/components/DesktopControls';

afterEach(() => {
	cleanup();
});

function DialogHarness({ onCancel = vi.fn() }: { onCancel?: () => void }) {
	const [open, setOpen] = useState(false);
	const closeDialog = () => {
		onCancel();
		setOpen(false);
	};

	return (
		<div className="AppRoot">
			<div>
				<button type="button" onClick={() => setOpen(true)}>
					Open dialog
				</button>
				<main data-testid="workspace-background">
					<button type="button">Background action</button>
				</main>
				{open ? (
					<DesktopDialog
						open
						title="Dialog title"
						onCancel={closeDialog}
						footer={
							<>
								<DesktopButton onClick={closeDialog}>Cancel</DesktopButton>
								<DesktopButton variant="primary" onClick={closeDialog}>
									Save
								</DesktopButton>
							</>
						}
					>
						<input aria-label="Dialog field" />
					</DesktopDialog>
				) : null}
			</div>
		</div>
	);
}

describe('DesktopDialog', () => {
	it('portals into the app root when available so dialog theme tokens are inherited', () => {
		const appRoot = document.createElement('div');
		appRoot.className = 'AppRoot';
		appRoot.dataset.testid = 'app-root';
		document.body.appendChild(appRoot);

		render(
			<div>
				<DesktopDialog open title="Themed dialog" onCancel={vi.fn()}>
					<input aria-label="Themed field" />
				</DesktopDialog>
			</div>
		);

		const dialog = screen.getByRole('dialog', { name: 'Themed dialog' });
		expect(dialog.parentElement?.parentElement).toBe(appRoot);
		appRoot.remove();
	});

	it('focuses the dialog, traps tab, closes on Escape, restores focus, and hides siblings', async () => {
		const onCancel = vi.fn();
		render(<DialogHarness onCancel={onCancel} />);
		const opener = screen.getByRole('button', { name: 'Open dialog' });
		const renderRoot = opener.parentElement;

		opener.focus();
		fireEvent.click(opener);

		const dialog = await screen.findByRole('dialog', { name: 'Dialog title' });
		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
		});
		expect(renderRoot).toHaveAttribute('aria-hidden', 'true');

		fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
		expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
		fireEvent.keyDown(dialog, { key: 'Tab' });
		expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

		fireEvent.keyDown(dialog, { key: 'Escape' });

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).toBeNull();
		});
		expect(onCancel).toHaveBeenCalled();
		expect(opener).toHaveFocus();
		expect(renderRoot).not.toHaveAttribute('aria-hidden');
	});
});
