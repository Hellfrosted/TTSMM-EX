import { cleanup, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionMods } from '../../model';
import { CollectionView } from '../../renderer/views/CollectionView';
import { createAppState, renderWithTestProviders } from './test-utils';

afterEach(() => {
	cleanup();
});

describe('CollectionView', () => {
	it('keeps the visible collection table stage mouse-interactable', async () => {
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([['default', activeCollection]]),
			allCollectionNames: new Set(['default']),
			mods: new SessionMods('', [])
		});

		const { container } = renderWithTestProviders(<CollectionView appState={appState} />);

		await vi.dynamicImportSettled();
		const contentStage = container.querySelector('[style*="pointer-events: auto"]');
		expect(contentStage).toContainElement(await screen.findByRole('table', { hidden: true }));
	});

	it('blocks launch while mods are still loading', async () => {
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([['default', activeCollection]]),
			allCollectionNames: new Set(['default']),
			loadingMods: true,
			mods: new SessionMods('', [])
		});
		vi.mocked(window.electron.readModMetadata).mockRejectedValue(new Error('scan failed'));

		renderWithTestProviders(<CollectionView appState={appState} />);

		expect(screen.getByRole('button', { name: 'Validate Collection' })).toBeDisabled();
		expect(screen.getAllByRole('button', { name: 'Launch Game' }).at(-1)).toBeDisabled();
		await vi.dynamicImportSettled();
	});

	it('shows the running launch state when the game is already running', async () => {
		const activeCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			activeCollection,
			allCollections: new Map([['default', activeCollection]]),
			allCollectionNames: new Set(['default']),
			mods: new SessionMods('', [])
		});
		vi.mocked(window.electron.isGameRunning).mockResolvedValue(true);

		renderWithTestProviders(<CollectionView appState={appState} />);

		const launchButton = await screen.findByRole('button', { name: 'Game Running' });
		expect(launchButton).toBeDisabled();
		expect(launchButton).toHaveAttribute('data-game-running', 'true');
	});
});
