import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import MenuBar from '../../renderer/components/MenuBar';
import { createAppState } from './test-utils';

function MenuBarHarness({ appState }: { appState: ReturnType<typeof createAppState> }) {
	const location = useLocation();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<MenuBar appState={appState} />
			<div data-testid="persisted-path">{appState.config.currentPath}</div>
		</>
	);
}

describe('MenuBar', () => {
	it('keeps currentPath in app state aligned with sidebar navigation before persisting it', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});

		render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} />} />
				</Routes>
			</MemoryRouter>
		);

		fireEvent.click(screen.getByText('Settings'));

		await waitFor(() => {
			expect(screen.getByTestId('location')).toHaveTextContent('/settings');
			expect(screen.getByTestId('persisted-path')).toHaveTextContent('/settings');
		});

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ currentPath: '/settings' }));
		});
	}, 10000);
});
