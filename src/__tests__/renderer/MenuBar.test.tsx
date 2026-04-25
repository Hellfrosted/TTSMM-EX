import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuBar from '../../renderer/components/MenuBar';
import { createAppState } from './test-utils';

function MenuBarHarness({ appState }: { appState: ReturnType<typeof createAppState> }) {
	const location = useLocation();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<MenuBar config={appState.config} firstModLoad={appState.firstModLoad} updateState={appState.updateState} />
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
	it('keeps currentPath in app state aligned with sidebar navigation before persisting it', async () => {
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
			expect(harness.getByTestId('persisted-path')).toHaveTextContent('/settings');
		});

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ currentPath: '/settings' }));
		});
	}, 10000);

	it('rolls back currentPath in app state if path persistence fails', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

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
			expect(harness.getByTestId('persisted-path')).toHaveTextContent('/settings');
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
			expect(harness.getByTestId('persisted-path')).toHaveTextContent('/block-lookup');
		});

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ currentPath: '/block-lookup' }));
		});
	}, 10000);

	it('rolls back to the last persisted path when a later navigation write fails', async () => {
		const appState = createAppState({
			config: {
				...createAppState().config,
				currentPath: '/collections/main'
			}
		});
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

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
		let resolveFirstWrite!: (value: boolean) => void;
		let resolveSecondWrite!: (value: boolean) => void;
		const firstWrite = new Promise<boolean>((resolve) => {
			resolveFirstWrite = resolve;
		});
		const secondWrite = new Promise<boolean>((resolve) => {
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

		resolveFirstWrite(true);
		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledTimes(2);
		});
		expect(window.electron.updateConfig).toHaveBeenNthCalledWith(1, expect.objectContaining({ currentPath: '/settings' }));
		expect(window.electron.updateConfig).toHaveBeenNthCalledWith(2, expect.objectContaining({ currentPath: '/collections/main' }));

		resolveSecondWrite(true);
		await waitFor(() => {
			expect(appState.config.currentPath).toBe('/collections/main');
		});
	}, 10000);
});
