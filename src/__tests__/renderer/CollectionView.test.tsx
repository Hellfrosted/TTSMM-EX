import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionMods } from '../../model';
import { CollectionView } from '../../renderer/views/CollectionView';
import { createAppState, renderWithQueryClient } from './test-utils';

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
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				unobserve: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);

		const { container } = renderWithQueryClient(<CollectionView appState={appState} />);

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
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				unobserve: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		vi.mocked(window.electron.readModMetadata).mockRejectedValue(new Error('scan failed'));

		renderWithQueryClient(<CollectionView appState={appState} />);

		expect(screen.getByRole('button', { name: 'Validate Collection' })).toBeDisabled();
		expect(screen.getAllByRole('button', { name: 'Launch Game' }).at(-1)).toBeDisabled();
		await vi.dynamicImportSettled();
	});
});
