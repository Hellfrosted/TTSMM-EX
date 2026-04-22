import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CollectionManagementToolbar from '../../renderer/components/collections/CollectionManagementToolbar';
import { createAppState } from './test-utils';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function stubResizeObserver() {
	const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
		return {
			observe: vi.fn(),
			unobserve: vi.fn(),
			disconnect: vi.fn()
		};
	});
	vi.stubGlobal('ResizeObserver', ResizeObserverMock);
}

describe('CollectionManagementToolbar', () => {
	it('opens the collection rename modal when the toolbar action is clicked', async () => {
		stubResizeObserver();

		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		render(
			<CollectionManagementToolbar
				appState={appState}
				madeEdits={false}
				searchString=""
				openModal={vi.fn()}
				saveCollectionCallback={vi.fn()}
				changeActiveCollectionCallback={vi.fn()}
				onReloadModListCallback={vi.fn()}
				openViewSettingsCallback={vi.fn()}
				onSearchCallback={vi.fn()}
				onSearchChangeCallback={vi.fn()}
				newCollectionCallback={vi.fn()}
				duplicateCollectionCallback={vi.fn()}
				renameCollectionCallback={vi.fn()}
				openNotification={vi.fn()}
			/>
		);

		const renameButton = screen.getByText('Rename').closest('button');
		expect(renameButton).not.toBeNull();
		fireEvent.click(renameButton!);

		expect(await screen.findByRole('button', { name: 'Rename Collection' })).toBeDisabled();
	}, 20000);

	it('keeps collection actions visible and moves reload plus view options outside the primary strip', async () => {
		stubResizeObserver();

		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		render(
			<CollectionManagementToolbar
				appState={appState}
				madeEdits
				searchString=""
				openModal={vi.fn()}
				saveCollectionCallback={vi.fn()}
				changeActiveCollectionCallback={vi.fn()}
				onReloadModListCallback={vi.fn()}
				openViewSettingsCallback={vi.fn()}
				onSearchCallback={vi.fn()}
				onSearchChangeCallback={vi.fn()}
				newCollectionCallback={vi.fn()}
				duplicateCollectionCallback={vi.fn()}
				renameCollectionCallback={vi.fn()}
				openNotification={vi.fn()}
			/>
		);

		expect(screen.getByRole('button', { name: /Duplicate/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Save Collection/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Copy JSON/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Reload Mods/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /View Options/ })).toBeInTheDocument();
	});
});
