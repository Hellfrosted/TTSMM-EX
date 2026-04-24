import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

async function clickToolbarAction(name: string | RegExp) {
	fireEvent.click(await screen.findByRole('button', { name }));
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

		expect(await screen.findByRole('textbox', { name: 'New collection name' })).toHaveValue('default');
		expect(screen.getByText('Rename the saved collection without changing its enabled mods.')).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: 'Rename Collection' })).toBeDisabled();
	}, 20000);

	it('prefills the duplicate collection modal with a readable copy name', async () => {
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

		await clickToolbarAction('Duplicate');

		expect(await screen.findByRole('textbox', { name: 'New collection name' })).toHaveValue('default copy');
		expect(screen.getByText('The duplicate keeps the current mod list and saves it under a new name.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Duplicate Collection' })).toBeEnabled();
	});

	it('keeps collection actions visible without a More overflow menu', async () => {
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

		expect(screen.getByRole('button', { name: /Rename/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /New/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Save Collection/ })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /More collection actions/ })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Duplicate/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Copy JSON/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Reload/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Table Options/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();

		expect(screen.getByText('Duplicate')).toBeInTheDocument();
		expect(screen.getByText('Copy JSON')).toBeInTheDocument();
		expect(screen.getByText('Reload')).toBeInTheDocument();
		expect(screen.getByText('Table Options')).toBeInTheDocument();
		expect(screen.getByText('Delete')).toBeInTheDocument();

		const collectionActions = screen.getByRole('group', { name: 'Collection actions' });
		const tableUtilities = screen.getByRole('group', { name: 'Table utilities' });
		expect(collectionActions).toHaveClass('CollectionToolbarActionGroup--collection');
		expect(tableUtilities).toHaveClass('CollectionToolbarActionGroup--utility');
		expect(within(collectionActions).queryByRole('button', { name: /Reload/ })).not.toBeInTheDocument();
		expect(within(collectionActions).queryByRole('button', { name: /Table Options/ })).not.toBeInTheDocument();
		expect(within(tableUtilities).getByRole('button', { name: /Reload/ })).toBeInTheDocument();
		expect(within(tableUtilities).getByRole('button', { name: /Table Options/ })).toBeInTheDocument();
	});

	it('copies the active collection JSON to the clipboard and reports success', async () => {
		stubResizeObserver();

		const defaultCollection = { name: 'default', mods: ['workshop:1'] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openNotification = vi.fn();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
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
				openNotification={openNotification}
			/>
		);

		await clickToolbarAction('Copy JSON');

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith(JSON.stringify(defaultCollection, null, '\t'));
		});
		expect(openNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Collection copied',
				description: 'default was copied as a formatted JSON export.'
			}),
			'success'
		);
	});

	it('reports a clipboard error instead of claiming success when export copying fails', async () => {
		stubResizeObserver();

		const defaultCollection = { name: 'default', mods: ['workshop:1'] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openNotification = vi.fn();
		const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'));
		Object.defineProperty(window.navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
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
				openNotification={openNotification}
			/>
		);

		await clickToolbarAction('Copy JSON');

		await waitFor(() => {
			expect(openNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Unable to copy collection',
					description: 'The collection export could not be written to the system clipboard.'
				}),
				'error'
			);
		});
	});

	it('labels the mod search field for assistive technologies', () => {
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

		expect(screen.getByLabelText('Search mods by name, ID, author, or tag')).toBeInTheDocument();
	});
});
