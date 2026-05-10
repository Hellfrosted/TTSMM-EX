import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionManagerModalType, CollectionViewType, MainColumnTitles, ModType, SessionMods } from '../../model';
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

	it('saves main table settings from the settings dialog form', async () => {
		const appState = createAppState();
		const closeModal = vi.fn();

		render(
			<CollectionManagerModal
				appState={appState}
				modalType={CollectionManagerModalType.VIEW_SETTINGS}
				launchGameWithErrors={false}
				currentView={CollectionViewType.MAIN}
				launchAnyway={vi.fn()}
				openNotification={vi.fn()}
				closeModal={closeModal}
				deleteCollection={vi.fn()}
			/>
		);

		fireEvent.click(screen.getByRole('switch', { name: 'Use extra-compact rows in the main collection table' }));
		fireEvent.change(screen.getByLabelText(`Saved width for ${MainColumnTitles.NAME} column`), {
			target: { value: '320' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save Table Settings' }));

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalled();
		});
		const [savedConfig] = vi.mocked(window.electron.updateConfig).mock.calls.at(-1)!;
		expect(savedConfig.viewConfigs.main?.smallRows).toBe(true);
		expect(savedConfig.viewConfigs.main?.columnWidthConfig?.[MainColumnTitles.NAME]).toBe(320);
		expect(closeModal).toHaveBeenCalled();
	});

	it('saves mod override IDs from the override form and reloads mods', async () => {
		const record = {
			uid: 'workshop:123',
			type: ModType.WORKSHOP,
			workshopID: BigInt(123),
			id: 'OriginalId',
			name: 'Overridden Mod'
		};
		const appState = createAppState();

		render(
			<CollectionManagerModal
				appState={appState}
				modalType={CollectionManagerModalType.EDIT_OVERRIDES}
				launchGameWithErrors={false}
				currentView={CollectionViewType.MAIN}
				launchAnyway={vi.fn()}
				openNotification={vi.fn()}
				closeModal={vi.fn()}
				currentRecord={record}
				deleteCollection={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText('Override ID'), {
			target: { value: 'DependencyTarget' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalled();
		});
		const [savedConfig] = vi.mocked(window.electron.updateConfig).mock.calls.at(-1)!;
		expect(savedConfig.userOverrides.get(record.uid)?.id).toBe('DependencyTarget');
		expect(appState.updateState).toHaveBeenCalledWith({ loadingMods: true });
	});
});
