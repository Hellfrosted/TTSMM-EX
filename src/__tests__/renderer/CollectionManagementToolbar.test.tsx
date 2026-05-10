import React from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CollectionManagementToolbar from '../../renderer/components/collections/CollectionManagementToolbar';
import { createAppState, renderInAppRoot } from './test-utils';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function clickToolbarAction(name: string | RegExp) {
	fireEvent.click(await screen.findByRole('button', { name }));
}

async function clickCollectionMenuAction(name: string | RegExp) {
	await clickToolbarAction('Collection actions');
	fireEvent.click(await screen.findByRole('menuitem', { name }));
}

async function findCollectionNameInput() {
	return screen.findByRole('textbox', { name: 'New collection name' }, { timeout: 10000 });
}

describe('CollectionManagementToolbar', () => {
	it('opens the collection rename modal when the toolbar action is clicked', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		renderInAppRoot(
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

		await clickCollectionMenuAction('Rename collection');

		expect(await findCollectionNameInput()).toHaveValue('default');
		expect(screen.getByText('Rename the saved collection without changing its enabled mods.')).toBeInTheDocument();
		expect(await screen.findByRole('button', { name: 'Rename Collection' })).toBeDisabled();
	}, 20000);

	it('prefills the duplicate collection modal with a readable copy name', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		renderInAppRoot(
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

		await clickCollectionMenuAction('Duplicate collection');

		expect(await findCollectionNameInput()).toHaveValue('default copy');
		expect(screen.getByText('The duplicate keeps the current mod list and saves it under a new name.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Duplicate Collection' })).toBeEnabled();
	});

	it('copies the active collection JSON to the clipboard and reports success', async () => {
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

		renderInAppRoot(
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

		await clickCollectionMenuAction('Copy JSON export');

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

	it('supports keyboard navigation inside the collection action menu', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		renderInAppRoot(
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

		await clickToolbarAction('Collection actions');
		const renameItem = await screen.findByRole('menuitem', { name: 'Rename collection' });
		await waitFor(() => {
			expect(renameItem).toHaveFocus();
		});

		fireEvent.keyDown(window, { key: 'ArrowDown' });
		expect(screen.getByRole('menuitem', { name: 'New collection' })).toHaveFocus();

		fireEvent.keyDown(window, { key: 'End' });
		expect(screen.getByRole('menuitem', { name: 'Delete collection' })).toHaveFocus();

		fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.getByRole('button', { name: 'Collection actions' })).toHaveFocus();
		expect(screen.queryByRole('menuitem', { name: 'Rename collection' })).not.toBeInTheDocument();
	});

	it('reports a clipboard error instead of claiming success when export copying fails', async () => {
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

		renderInAppRoot(
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

		await clickCollectionMenuAction('Copy JSON export');

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

	it('opens table settings directly from the toolbar', async () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});
		const openViewSettingsCallback = vi.fn();

		renderInAppRoot(
			<CollectionManagementToolbar
				appState={appState}
				madeEdits={false}
				searchString=""
				openModal={vi.fn()}
				saveCollectionCallback={vi.fn()}
				changeActiveCollectionCallback={vi.fn()}
				onReloadModListCallback={vi.fn()}
				openViewSettingsCallback={openViewSettingsCallback}
				onSearchCallback={vi.fn()}
				onSearchChangeCallback={vi.fn()}
				newCollectionCallback={vi.fn()}
				duplicateCollectionCallback={vi.fn()}
				renameCollectionCallback={vi.fn()}
				openNotification={vi.fn()}
			/>
		);

		expect(screen.queryByRole('button', { name: 'Table' })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Table Settings' }));

		expect(openViewSettingsCallback).toHaveBeenCalledOnce();
	});

	it('labels the mod search field for assistive technologies', () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		renderInAppRoot(
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

	it('announces launch-ready validation state without expanding the toolbar label', () => {
		const defaultCollection = { name: 'default', mods: [] };
		const appState = createAppState({
			allCollections: new Map([['default', defaultCollection]]),
			allCollectionNames: new Set(['default']),
			activeCollection: defaultCollection
		});

		renderInAppRoot(
			<CollectionManagementToolbar
				appState={appState}
				launchReady
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

		const readyButton = screen.getByRole('button', { name: 'Collection Ready' });
		expect(readyButton).toHaveTextContent(/^Ready$/);
		expect(readyButton).toHaveAttribute('title', 'Collection is validated and ready to launch');
	});
});
