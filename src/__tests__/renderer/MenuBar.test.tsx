import React from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuBar from '../../renderer/components/MenuBar';
import { createAppState } from './test-utils';

function MenuBarHarness({
	appState,
	disableNavigation,
	onWorkspacePreview
}: {
	appState: ReturnType<typeof createAppState>;
	disableNavigation?: boolean;
	onWorkspacePreview?: (path: string) => void;
}) {
	const location = useLocation();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<MenuBar
				config={appState.config}
				disableNavigation={disableNavigation}
				onWorkspacePreview={onWorkspacePreview}
				updateState={appState.updateState}
			/>
			<div data-testid="persisted-path">{appState.config.currentPath}</div>
		</>
	);
}

function getSettingsMenuItem(container: HTMLElement) {
	return container.querySelector('li[data-menu-id$="/settings"] button') as HTMLElement;
}

function getCollectionsMenuItem(container: HTMLElement) {
	return container.querySelector('li[data-menu-id$="/collections/main"] button') as HTMLElement;
}

function getBlockLookupMenuItem(container: HTMLElement) {
	return container.querySelector('li[data-menu-id$="/block-lookup"] button') as HTMLElement;
}

function getHarness(container: HTMLElement) {
	return within(container);
}

afterEach(() => {
	cleanup();
});

describe('MenuBar', () => {
	it('navigates without persisting the selected workspace into config', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});

		const view = render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} />} />
				</Routes>
			</MemoryRouter>
		);

		fireEvent.click(getSettingsMenuItem(view.container));
		const harness = getHarness(view.container);

		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/settings');
		});

		expect(window.electron.updateConfig).not.toHaveBeenCalled();
		expect(appState.config.currentPath).toBe('/collections/main');
		expect(appState.updateState).not.toHaveBeenCalled();
	}, 10000);

	it('navigates to the block lookup workspace from the sidebar', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});

		const view = render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} />} />
				</Routes>
			</MemoryRouter>
		);

		fireEvent.click(getBlockLookupMenuItem(view.container));
		const harness = getHarness(view.container);

		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/block-lookup');
		});

		expect(window.electron.updateConfig).not.toHaveBeenCalled();
		expect(appState.config.currentPath).toBe('/collections/main');
	}, 10000);

	it('cycles primary workspaces forward with Ctrl+Tab and backward with Ctrl+Shift+Tab', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});

		const view = render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} />} />
				</Routes>
			</MemoryRouter>
		);
		const harness = getHarness(view.container);

		fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/block-lookup');
		});

		fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/settings');
		});

		fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey: true });
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/block-lookup');
		});
		expect(window.electron.updateConfig).not.toHaveBeenCalled();
		expect(appState.config.currentPath).toBe('/collections/main');
	}, 10000);

	it('does not cycle workspaces with Ctrl+Tab while navigation is disabled', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});

		const view = render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} disableNavigation />} />
				</Routes>
			</MemoryRouter>
		);
		const harness = getHarness(view.container);

		fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(harness.getByTestId('location')).toHaveTextContent('/collections/main');
		expect(window.electron.updateConfig).not.toHaveBeenCalled();
	}, 10000);

	it('previews workspace navigation without starting a mod reload on ordinary collection entry', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/settings'
			}
		});
		const onWorkspacePreview = vi.fn();

		const view = render(
			<MemoryRouter initialEntries={['/settings']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} onWorkspacePreview={onWorkspacePreview} />} />
				</Routes>
			</MemoryRouter>
		);
		const harness = getHarness(view.container);

		fireEvent.click(getBlockLookupMenuItem(view.container));
		expect(onWorkspacePreview).toHaveBeenLastCalledWith('/block-lookup');
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/block-lookup');
		});
		expect(appState.loadingMods).toBe(false);

		fireEvent.click(getCollectionsMenuItem(view.container));
		expect(onWorkspacePreview).toHaveBeenLastCalledWith('/collections/main');
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/collections/main');
		});
		expect(appState.loadingMods).toBe(false);
	}, 10000);
});
