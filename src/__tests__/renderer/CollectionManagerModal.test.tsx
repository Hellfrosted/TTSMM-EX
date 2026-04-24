import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
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

		expect(await screen.findByText('Collection has blocking issues')).toBeInTheDocument();
		const [issueRegion] = screen.getAllByRole('region', { name: 'Mods to review' });
		expect(screen.getByText('Mods to review')).toBeInTheDocument();
		expect(screen.getByText('Broken Mod')).toBeInTheDocument();
		expect(within(issueRegion).getByText('Missing dependencies: NuterraSteam (Beta)')).toBeInTheDocument();
		expect(within(issueRegion).getByText('Conflicts with: Conflicting Mod')).toBeInTheDocument();
		expect(within(issueRegion).getAllByRole('list')).toHaveLength(2);
	}, 10000);

});
