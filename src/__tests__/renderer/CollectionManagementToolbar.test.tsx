import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CollectionManagementToolbar from '../../renderer/components/collections/CollectionManagementToolbar';
import { createAppState } from './test-utils';

describe('CollectionManagementToolbar', () => {
	it('opens the collection rename modal when the toolbar action is clicked', async () => {
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
				validateCollectionCallback={vi.fn()}
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
});
