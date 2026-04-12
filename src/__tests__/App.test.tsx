import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../renderer/App';

describe('App', () => {
	it('should render', async () => {
		render(
			<MemoryRouter initialEntries={['/loading/steamworks']}>
				<Routes>
					<Route path="/" element={<App />}>
						<Route path="loading">
							<Route path="steamworks" element={<div>Steamworks</div>} />
						</Route>
					</Route>
				</Routes>
			</MemoryRouter>
		);

		await waitFor(() => {
			expect(screen.getByText('Steamworks')).toBeInTheDocument();
		});
	});
});
