import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import ModDetailsFooter from '../../renderer/components/collections/ModDetailsFooter';
import { WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS } from '../../shared/workshop-dependency-lookup';
import { createAppState } from './test-utils';

function renderFooter(props: React.ComponentProps<typeof ModDetailsFooter>) {
	return render(<ModDetailsFooter {...props} />);
}

describe('ModDetailsFooter', () => {
	beforeEach(() => {
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				unobserve: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
	});

	afterEach(() => {
		cleanup();
	});

	it('shows the workshop id as the primary identity while keeping the mod id visible in inspect details', () => {
		const workshopMod = {
			uid: 'workshop:42',
			type: ModType.WORKSHOP,
			workshopID: BigInt(42),
			id: 'HumanReadableModId',
			name: 'Workshop Title',
			subscribed: true,
			installed: true
		};
		const mods = new SessionMods('', [workshopMod]);
		const appState = createAppState({
			mods,
			activeCollection: { name: 'default', mods: [workshopMod.uid] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const [currentRecord] = mods.foundMods;

		renderFooter({
			bigDetails: true,
			halfLayoutMode: 'bottom',
			lastValidationStatus: true,
			appState,
			currentRecord,
			activeTabKey: 'inspect',
			setActiveTabKey: vi.fn(),
			expandFooterCallback: vi.fn(),
			toggleHalfLayoutCallback: vi.fn(),
			closeFooterCallback: vi.fn(),
			enableModCallback: vi.fn(),
			disableModCallback: vi.fn(),
			setModSubsetCallback: vi.fn(),
			openNotification: vi.fn(),
			validateCollection: vi.fn(),
			openModal: vi.fn()
		});

		expect(screen.getByText('42 (workshop:42)')).toBeInTheDocument();
		expect(screen.getAllByText('Mod ID').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Workshop ID').length).toBeGreaterThan(0);
		expect(screen.getAllByText(/^ID$/).length).toBeGreaterThan(0);
	});

	it('shows pending dependency rows with the workshop id in the ID column while validation is stale', () => {
		const currentMod = {
			uid: 'local:core',
			type: ModType.LOCAL,
			id: 'CoreMod',
			name: 'Core Mod',
			steamDependencies: [BigInt(11)]
		};
		const dependencyMod = {
			uid: 'workshop:11',
			type: ModType.WORKSHOP,
			workshopID: BigInt(11),
			id: 'DependencyMod',
			name: 'Dependency Mod',
			subscribed: true,
			installed: true
		};
		const mods = new SessionMods('', [currentMod, dependencyMod]);
		const appState = createAppState({
			mods,
			activeCollection: { name: 'default', mods: [currentMod.uid, dependencyMod.uid] }
		});

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const [currentRecord] = mods.foundMods;

		renderFooter({
			bigDetails: false,
			halfLayoutMode: 'bottom',
			lastValidationStatus: undefined,
			appState,
			currentRecord,
			activeTabKey: 'dependencies',
			setActiveTabKey: vi.fn(),
			expandFooterCallback: vi.fn(),
			toggleHalfLayoutCallback: vi.fn(),
			closeFooterCallback: vi.fn(),
			enableModCallback: vi.fn(),
			disableModCallback: vi.fn(),
			setModSubsetCallback: vi.fn(),
			openNotification: vi.fn(),
			validateCollection: vi.fn(),
			openModal: vi.fn()
		});

		expect(screen.getAllByText('ID').length).toBeGreaterThan(0);
		expect(screen.getByText('11')).toBeInTheDocument();
		expect(screen.getByText('Pending')).toBeInTheDocument();
	});

	it('retries workshop dependency lookup after leaving and reopening the dependencies tab', async () => {
		const workshopMod = {
			uid: 'workshop:77',
			type: ModType.WORKSHOP,
			workshopID: BigInt(77),
			id: 'RetryMod',
			name: 'Retry Mod',
			subscribed: true,
			installed: true
		};
		const mods = new SessionMods('', [workshopMod]);
		const appState = createAppState({
			mods,
			activeCollection: { name: 'default', mods: [workshopMod.uid] }
		});
		const fetchWorkshopDependencies = vi.fn(async () => false);
		Object.assign(window.electron, { fetchWorkshopDependencies });

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const [currentRecord] = mods.foundMods;

		const footerProps = {
			bigDetails: false,
			halfLayoutMode: 'bottom' as const,
			lastValidationStatus: true,
			appState,
			currentRecord,
			setActiveTabKey: vi.fn(),
			expandFooterCallback: vi.fn(),
			toggleHalfLayoutCallback: vi.fn(),
			closeFooterCallback: vi.fn(),
			enableModCallback: vi.fn(),
			disableModCallback: vi.fn(),
			setModSubsetCallback: vi.fn(),
			openNotification: vi.fn(),
			validateCollection: vi.fn(),
			openModal: vi.fn()
		};
		const { rerender } = renderFooter({
			...footerProps,
			activeTabKey: 'dependencies'
		});

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
		});

		rerender(
			<ModDetailsFooter
				{...footerProps}
				activeTabKey="info"
			/>
		);

		rerender(
			<ModDetailsFooter
				{...footerProps}
				activeTabKey="dependencies"
			/>
		);

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(2);
		});
	});

	it('offers a same-tab retry after a workshop dependency lookup failure', async () => {
		const workshopMod = {
			uid: 'workshop:77',
			type: ModType.WORKSHOP,
			workshopID: BigInt(77),
			id: 'RetryMod',
			name: 'Retry Mod',
			subscribed: true,
			installed: true
		};
		const mods = new SessionMods('', [workshopMod]);
		const appState = createAppState({
			mods,
			activeCollection: { name: 'default', mods: [workshopMod.uid] }
		});
		const fetchWorkshopDependencies = vi.fn(async () => false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		Object.assign(window.electron, { fetchWorkshopDependencies });

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const [currentRecord] = mods.foundMods;

		renderFooter({
			bigDetails: false,
			halfLayoutMode: 'bottom',
			lastValidationStatus: true,
			appState,
			currentRecord,
			activeTabKey: 'dependencies',
			setActiveTabKey: vi.fn(),
			expandFooterCallback: vi.fn(),
			toggleHalfLayoutCallback: vi.fn(),
			closeFooterCallback: vi.fn(),
			enableModCallback: vi.fn(),
			disableModCallback: vi.fn(),
			setModSubsetCallback: vi.fn(),
			openNotification: vi.fn(),
			validateCollection: vi.fn(),
			openModal: vi.fn()
		});

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('button', { name: 'Retry Dependency Lookup' })).toBeInTheDocument();
			expect(screen.getAllByText('Failed to load workshop dependencies for 77').length).toBeGreaterThan(0);
		});
		fireEvent.click(screen.getByRole('button', { name: 'Retry Dependency Lookup' }));

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(2);
		});
	});

	it('refreshes stale workshop dependency snapshots when opening the dependencies tab', async () => {
		const workshopMod = {
			uid: 'workshop:77',
			type: ModType.WORKSHOP,
			workshopID: BigInt(77),
			id: 'RetryMod',
			name: 'Retry Mod',
			subscribed: true,
			installed: true,
			steamDependencies: [BigInt(11)],
			steamDependenciesFetchedAt: Date.now() - WORKSHOP_DEPENDENCY_LOOKUP_TTL_MS - 1
		};
		const mods = new SessionMods('', [workshopMod]);
		const appState = createAppState({
			mods,
			activeCollection: { name: 'default', mods: [workshopMod.uid] }
		});
		const fetchWorkshopDependencies = vi.fn(async () => true);
		Object.assign(window.electron, { fetchWorkshopDependencies });

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const [currentRecord] = mods.foundMods;

		renderFooter({
			bigDetails: false,
			halfLayoutMode: 'bottom',
			lastValidationStatus: true,
			appState,
			currentRecord,
			activeTabKey: 'dependencies',
			setActiveTabKey: vi.fn(),
			expandFooterCallback: vi.fn(),
			toggleHalfLayoutCallback: vi.fn(),
			closeFooterCallback: vi.fn(),
			enableModCallback: vi.fn(),
			disableModCallback: vi.fn(),
			setModSubsetCallback: vi.fn(),
			openNotification: vi.fn(),
			validateCollection: vi.fn(),
			openModal: vi.fn()
		});

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
		});
	});

	it('does not update ignored validation config when persisting that change fails', async () => {
		const currentMod = {
			uid: 'local:core',
			type: ModType.LOCAL,
			id: 'CoreMod',
			name: 'Core Mod',
			steamDependencies: [BigInt(11)]
		};
		const dependencyMod = {
			uid: 'workshop:11',
			type: ModType.WORKSHOP,
			workshopID: BigInt(11),
			id: 'DependencyMod',
			name: 'Dependency Mod',
			subscribed: true,
			installed: true
		};
		const mods = new SessionMods('', [currentMod, dependencyMod]);
		const appState = createAppState({
			mods,
			activeCollection: { name: 'default', mods: [currentMod.uid, dependencyMod.uid] }
		});
		const validateCollection = vi.fn();
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);

		setupDescriptors(mods, appState.config.userOverrides, appState.config);
		const [currentRecord] = mods.foundMods;

		renderFooter({
			bigDetails: false,
			halfLayoutMode: 'bottom',
			lastValidationStatus: true,
			appState,
			currentRecord,
			activeTabKey: 'dependencies',
			setActiveTabKey: vi.fn(),
			expandFooterCallback: vi.fn(),
			toggleHalfLayoutCallback: vi.fn(),
			closeFooterCallback: vi.fn(),
			enableModCallback: vi.fn(),
			disableModCallback: vi.fn(),
			setModSubsetCallback: vi.fn(),
			openNotification: vi.fn(),
			validateCollection,
			openModal: vi.fn()
		});

		const dependencyIgnoreCheckbox = screen.getByLabelText('Ignore validation error for Dependency Mod');
		expect(dependencyIgnoreCheckbox).not.toBeDisabled();
		fireEvent.click(dependencyIgnoreCheckbox);

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalled();
		});
		expect(validateCollection).not.toHaveBeenCalled();
		expect(appState.config.ignoredValidationErrors.size).toBe(0);
	});
});
