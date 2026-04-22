import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionManagerModalType, CollectionViewType, ModType, SessionMods } from '../../model';
import CollectionManagerModal from '../../renderer/components/collections/CollectionManagerModal';
import { createAppState } from './test-utils';

afterEach(() => {
	cleanup();
});

describe('CollectionManagerModal', () => {
	it('shows per-mod validation details in the configuration error modal', async () => {
		const brokenMod = {
			uid: 'workshop:1',
			type: ModType.WORKSHOP,
			workshopID: BigInt(1),
			id: 'BrokenMod',
			name: 'Broken Mod'
		};
		const conflictingMod = {
			uid: 'workshop:2',
			type: ModType.WORKSHOP,
			workshopID: BigInt(2),
			id: 'ConflictingMod',
			name: 'Conflicting Mod'
		};
		const mods = new SessionMods('', [brokenMod, conflictingMod]);
		mods.modIdToModDataMap.set(brokenMod.uid, brokenMod);
		mods.modIdToModDataMap.set(conflictingMod.uid, conflictingMod);
		const appState = createAppState({ mods });

		render(
			<CollectionManagerModal
				appState={appState}
				modalType={CollectionManagerModalType.ERRORS_FOUND}
				launchGameWithErrors={false}
				currentView={CollectionViewType.MAIN}
				collectionErrors={{
					[brokenMod.uid]: {
						missingDependencies: [{ UIDs: new Set(), name: 'NuterraSteam (Beta)' }],
						incompatibleMods: [conflictingMod.uid]
					}
				}}
				launchAnyway={vi.fn()}
				openNotification={vi.fn()}
				closeModal={vi.fn()}
				currentRecord={brokenMod}
				deleteCollection={vi.fn()}
			/>
		);

		expect(await screen.findByText('Errors Found in Configuration')).toBeInTheDocument();
		expect(screen.getByText('Affected Mods')).toBeInTheDocument();
		expect(screen.getByText('Broken Mod')).toBeInTheDocument();
		expect(screen.getByText('Missing dependencies: NuterraSteam (Beta)')).toBeInTheDocument();
		expect(screen.getByText('Conflicts with: Conflicting Mod')).toBeInTheDocument();
	}, 10000);

	it('renders the view settings modal in a compact side-by-side layout', async () => {
		const appState = createAppState();

		render(
			<CollectionManagerModal
				appState={appState}
				modalType={CollectionManagerModalType.VIEW_SETTINGS}
				launchGameWithErrors={false}
				currentView={CollectionViewType.MAIN}
				launchAnyway={vi.fn()}
				openNotification={vi.fn()}
				closeModal={vi.fn()}
				deleteCollection={vi.fn()}
			/>
		);

		expect(await screen.findByText('Editing Collection View Settings')).toBeInTheDocument();
		expect(screen.getByText('Table layout')).toBeInTheDocument();
		expect(screen.getByText('Select visible columns')).toBeInTheDocument();
		expect(screen.getByText('Compact Rows')).toBeInTheDocument();
		expect(screen.getByText('Tags')).toBeInTheDocument();
	});
});
