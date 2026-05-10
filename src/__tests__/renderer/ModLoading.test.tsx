import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionMods, type AppState } from '../../model';
import ModLoadingComponent from '../../renderer/components/loading/ModLoading';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { createAppState, createTestQueryClient, renderWithQueryClient } from './test-utils';

function renderModLoading(appState: ReturnType<typeof createAppState>, modLoadCompleteCallback: () => void) {
	return renderWithQueryClient(<ModLoadingComponent appState={appState} modLoadCompleteCallback={modLoadCompleteCallback} />);
}

describe('ModLoading', () => {
	it('keeps the route in loading state and surfaces the scan error when metadata loading fails', async () => {
		const appState = createAppState({
			loadingMods: true,
			mods: new SessionMods('', [])
		});
		const modLoadCompleteCallback = vi.fn();

		vi.mocked(window.electron.readModMetadata).mockRejectedValueOnce(new Error('scan failed'));

		renderModLoading(appState, modLoadCompleteCallback);

		await waitFor(() => {
			expect(window.electron.readModMetadata).toHaveBeenCalled();
		});
		expect(await screen.findByText('scan failed')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Retry Mod Scan' })).toBeInTheDocument();
		expect(modLoadCompleteCallback).not.toHaveBeenCalled();
		expect(appState.loadingMods).toBe(true);
	});

	it('ignores stale metadata results after a newer scan starts', async () => {
		let resolveFirstScan!: (mods: SessionMods) => void;
		let resolveSecondScan!: (mods: SessionMods) => void;
		const firstScan = new Promise<SessionMods>((resolve) => {
			resolveFirstScan = resolve;
		});
		const secondScan = new Promise<SessionMods>((resolve) => {
			resolveSecondScan = resolve;
		});
		vi.mocked(window.electron.readModMetadata)
			.mockImplementationOnce(() => firstScan)
			.mockImplementationOnce(() => secondScan);

		const sharedState = createAppState({
			loadingMods: true,
			mods: new SessionMods('', [])
		});
		const updateState = vi.fn((props: Partial<AppState>) => {
			Object.assign(sharedState, props);
		});
		const appStateA = { ...sharedState, updateState };
		const appStateB = { ...sharedState, updateState, forceReloadMods: true };
		const modLoadCompleteCallback = vi.fn();
		const freshMods = new SessionMods('', [{ uid: 'local:fresh', id: 'Fresh', name: 'Fresh', type: 'local' as const }]);
		const staleMods = new SessionMods('', [{ uid: 'local:stale', id: 'Stale', name: 'Stale', type: 'local' as const }]);

		const queryClient = createTestQueryClient();

		const { rerender } = renderWithQueryClient(
			<ModLoadingComponent appState={appStateA} modLoadCompleteCallback={modLoadCompleteCallback} />,
			{ queryClient }
		);
		rerender(<ModLoadingComponent appState={appStateB} modLoadCompleteCallback={modLoadCompleteCallback} />);

		resolveSecondScan(freshMods);
		await waitFor(() => {
			expect(modLoadCompleteCallback).toHaveBeenCalledTimes(1);
			expect(sharedState.mods).toBe(freshMods);
		});

		resolveFirstScan(staleMods);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(sharedState.mods).toBe(freshMods);
		expect(modLoadCompleteCallback).toHaveBeenCalledTimes(1);
	});

	it('refreshes mod metadata without changing the active collection', async () => {
		const activeCollection = { name: 'default', mods: ['local:kept'] };
		const refreshedMods = new SessionMods('', [{ uid: 'local:fresh', id: 'Fresh', name: 'Fresh', type: 'local' as const }]);
		vi.mocked(window.electron.readModMetadata).mockResolvedValueOnce(refreshedMods);
		const appState = createAppState({
			activeCollection,
			allCollectionNames: new Set(['default']),
			allCollections: new Map([['default', activeCollection]]),
			forceReloadMods: true,
			loadingMods: true,
			mods: new SessionMods('', [])
		});
		const modLoadCompleteCallback = vi.fn();

		renderModLoading(appState, modLoadCompleteCallback);

		await waitFor(() => {
			expect(modLoadCompleteCallback).toHaveBeenCalledTimes(1);
		});

		expect(window.electron.readModMetadata).toHaveBeenCalledWith(undefined, [`workshop:${DEFAULT_CONFIG.workshopID}`], {
			treatNuterraSteamBetaAsEquivalent: true
		});
		expect(appState.activeCollection).toBe(activeCollection);
		expect(appState.mods).toBe(refreshedMods);
		expect(appState.loadingMods).toBe(false);
		expect(appState.forceReloadMods).toBe(false);
	});
});
