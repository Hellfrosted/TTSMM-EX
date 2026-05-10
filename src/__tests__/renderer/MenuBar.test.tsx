import React from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuBar from '../../renderer/components/MenuBar';
import { createAppState } from './test-utils';
import type { AppConfig } from '../../model';

function MenuBarHarness({ appState, disableNavigation }: { appState: ReturnType<typeof createAppState>; disableNavigation?: boolean }) {
	const location = useLocation();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<MenuBar
				config={appState.config}
				disableNavigation={disableNavigation}
				firstModLoad={appState.firstModLoad}
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
	it('persists sidebar navigation without mutating app config state on the click path', async () => {
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

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ currentPath: '/settings' }));
		});
		expect(harness.getByTestId('persisted-path')).toHaveTextContent('/collections/main');
		expect(appState.updateState).not.toHaveBeenCalled();
	}, 10000);

	it('rolls back the route if path persistence fails', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});
		vi.mocked(window.electron.updateConfig).mockRejectedValueOnce(new Error('write failed'));

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

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(appState.config.currentPath).toBe('/collections/main');
			expect(harness.getByTestId('location')).toHaveTextContent('/collections/main');
			expect(appState.loadingMods).toBe(false);
		});
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

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ currentPath: '/block-lookup' }));
		});
		expect(harness.getByTestId('persisted-path')).toHaveTextContent('/collections/main');
		expect(appState.updateState).not.toHaveBeenCalled();
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
		expect(harness.getByTestId('persisted-path')).toHaveTextContent('/collections/main');
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

	it('starts the initial mod load only when entering collections before mods have loaded', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/settings'
			},
			firstModLoad: false
		});

		const view = render(
			<MemoryRouter initialEntries={['/settings']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} />} />
				</Routes>
			</MemoryRouter>
		);
		const harness = getHarness(view.container);

		fireEvent.click(getBlockLookupMenuItem(view.container));
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/block-lookup');
		});
		expect(appState.updateState).not.toHaveBeenCalled();

		fireEvent.click(getCollectionsMenuItem(view.container));
		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/collections/main');
		});
		expect(appState.updateState).toHaveBeenCalledWith({ loadingMods: true });
	}, 10000);

	it('rolls back to the last persisted path when a later navigation write fails', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});
		vi.mocked(window.electron.updateConfig).mockRejectedValueOnce(new Error('write failed'));

		const view = render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="*" element={<MenuBarHarness appState={appState} />} />
				</Routes>
			</MemoryRouter>
		);
		const harness = getHarness(view.container);

		fireEvent.click(getSettingsMenuItem(view.container));
		fireEvent.click(getCollectionsMenuItem(view.container));

		await waitFor(() => {
			expect(harness.getByTestId('location')).toHaveTextContent('/collections/main');
			expect(harness.getByTestId('persisted-path')).toHaveTextContent('/collections/main');
		});

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(1);
		});
		expect(appState.config.currentPath).toBe('/collections/main');
	}, 10000);

	it('serializes route persistence so a newer path waits for the older write to settle', async () => {
		let resolveFirstWrite!: (value: AppConfig | null) => void;
		let resolveSecondWrite!: (value: AppConfig | null) => void;
		const firstWrite = new Promise<AppConfig | null>((resolve) => {
			resolveFirstWrite = resolve;
		});
		const secondWrite = new Promise<AppConfig | null>((resolve) => {
			resolveSecondWrite = resolve;
		});
		vi.mocked(window.electron.updateConfig)
			.mockImplementationOnce(() => firstWrite)
			.mockImplementationOnce(() => secondWrite);

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
		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(getCollectionsMenuItem(view.container));
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(window.electron.updateConfig).toHaveBeenCalledTimes(1);

		resolveFirstWrite({ ...appState.config, currentPath: '/settings' });
		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(2);
		});
		expect(window.electron.updateConfig).toHaveBeenNthCalledWith(1, expect.objectContaining({ currentPath: '/settings' }));
		expect(window.electron.updateConfig).toHaveBeenNthCalledWith(2, expect.objectContaining({ currentPath: '/collections/main' }));

		resolveSecondWrite({ ...appState.config, currentPath: '/collections/main' });
		await waitFor(() => {
			expect(appState.config.currentPath).toBe('/collections/main');
		});
	}, 10000);

	it('does not roll back navigation state after unmounting during a failed path write', async () => {
		let rejectWrite!: (error: Error) => void;
		const failedWrite = new Promise<AppConfig | null>((_resolve, reject) => {
			rejectWrite = reject;
		});
		vi.mocked(window.electron.updateConfig).mockImplementationOnce(() => failedWrite);

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
		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(1);
		});

		view.unmount();
		rejectWrite(new Error('write failed'));
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});

		expect(appState.config.currentPath).toBe('/collections/main');
		expect(appState.updateState).not.toHaveBeenCalled();
	}, 10000);
});
