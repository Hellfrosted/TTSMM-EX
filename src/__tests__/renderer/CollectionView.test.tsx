import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionMods } from '../../model';
import { CollectionView } from '../../renderer/views/CollectionView';
import { createAppState } from './test-utils';

afterEach(() => {
	cleanup();
});

describe('CollectionView', () => {
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
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		vi.mocked(window.electron.readModMetadata).mockRejectedValue(new Error('scan failed'));

		render(<CollectionView appState={appState} />);

		expect(screen.getByRole('button', { name: 'Validate Collection' })).toBeDisabled();
		expect(screen.getAllByRole('button', { name: 'Launch Game' }).at(-1)).toBeDisabled();
		await vi.dynamicImportSettled();
	});
});
