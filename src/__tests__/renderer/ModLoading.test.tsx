import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionMods } from '../../model';
import ModLoadingComponent from '../../renderer/components/loading/ModLoading';
import { createAppState } from './test-utils';

describe('ModLoading', () => {
	it('keeps the route in loading state and surfaces the scan error when metadata loading fails', async () => {
		const appState = createAppState({
			loadingMods: true,
			mods: new SessionMods('', [])
		});
		const modLoadCompleteCallback = vi.fn();

		vi.mocked(window.electron.readModMetadata).mockRejectedValueOnce(new Error('scan failed'));

		render(<ModLoadingComponent appState={appState} modLoadCompleteCallback={modLoadCompleteCallback} />);

		await waitFor(() => {
			expect(window.electron.readModMetadata).toHaveBeenCalled();
		});
		expect(await screen.findByText('scan failed')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Retry Mod Scan' })).toBeInTheDocument();
		expect(modLoadCompleteCallback).not.toHaveBeenCalled();
		expect(appState.loadingMods).toBe(true);
	});
});
