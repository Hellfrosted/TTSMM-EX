import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../model';
import MainCollectionComponent from '../../renderer/components/collections/MainCollectionComponent';
import CollectionRoute from '../../renderer/views/CollectionView';
import { createAppState } from './test-utils';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function CollectionRouteHarness({ appState }: { appState: AppState }) {
	const location = useLocation();

	return (
		<>
			<div data-testid="location">{location.pathname}</div>
			<Outlet context={appState} />
		</>
	);
}

describe('CollectionRoute', () => {
	it('renders the main collection view even from the parent collection route', async () => {
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([['default', activeCollection]]),
			allCollectionNames: new Set(['default'])
		});
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				unobserve: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);

		render(
			<MemoryRouter initialEntries={['/collections']}>
				<Routes>
					<Route path="/" element={<CollectionRouteHarness appState={appState} />}>
						<Route path="collections" element={<CollectionRoute />}>
							<Route index element={<Navigate replace to="main" />} />
							<Route path="main" element={<MainCollectionComponent />} />
							<Route path="*" element={<Navigate replace to="main" />} />
						</Route>
					</Route>
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getAllByTestId('location').at(-1)).toHaveTextContent('/collections');
		});

		expect(screen.getAllByText('Launch Game').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
	}, 15000);

	it('does not persist column widths into app state when the config write fails', async () => {
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([['default', activeCollection]]),
			allCollectionNames: new Set(['default'])
		});
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				unobserve: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

		render(
			<MemoryRouter initialEntries={['/collections/main']}>
				<Routes>
					<Route path="/" element={<CollectionRouteHarness appState={appState} />}>
						<Route path="collections" element={<CollectionRoute />}>
							<Route index element={<Navigate replace to="main" />} />
							<Route path="main" element={<MainCollectionComponent />} />
							<Route path="*" element={<Navigate replace to="main" />} />
						</Route>
					</Route>
				</Routes>
			</MemoryRouter>
		);

		const [resizeHandle] = await screen.findAllByLabelText('Resize ID');
		fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalled();
		});
		expect(appState.config.viewConfigs.main?.columnWidthConfig).toBeUndefined();
	});
});
