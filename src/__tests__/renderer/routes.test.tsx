/// <reference path="../types/global.d.ts" />
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../renderer/App', () => ({
	default: function MockApp() {
		const location = useLocation();

		return (
			<div>
				<span data-testid="pathname">{location.pathname}</span>
				<Outlet />
			</div>
		);
	}
}));

import { AppRoutes } from '../../renderer/routes';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('AppRoutes', () => {
	it('keeps Population Pool as a valid top-level workspace route', async () => {
		render(
			<MemoryRouter initialEntries={['/population-pool']}>
				<AppRoutes />
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getByTestId('pathname')).toHaveTextContent('/population-pool');
		});
	});
});
