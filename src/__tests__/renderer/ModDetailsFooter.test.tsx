import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ModData, ModType, SessionMods, setupDescriptors } from '../../model';
import ModDetailsFooter from '../../renderer/components/collections/ModDetailsFooter';
import { WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS } from '../../shared/workshop-dependency-snapshot';
import { createAppState } from './test-utils';

type FooterProps = React.ComponentProps<typeof ModDetailsFooter>;

function renderFooter(props: FooterProps) {
	return render(<ModDetailsFooter {...props} />);
}

function createFooterProps(
	appState: FooterProps['appState'],
	currentRecord: FooterProps['currentRecord'],
	props: Partial<FooterProps> = {}
): FooterProps {
	return {
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
		openModal: vi.fn(),
		...props
	};
}

function createWorkshopMod(overrides: Partial<ModData> = {}): ModData {
	const workshopID = overrides.workshopID ?? BigInt(77);
	return {
		uid: `workshop:${workshopID.toString()}`,
		type: ModType.WORKSHOP,
		workshopID,
		id: 'RetryMod',
		name: 'Retry Mod',
		subscribed: true,
		installed: true,
		...overrides
	};
}

function createLocalMod(overrides: Partial<ModData> = {}): ModData {
	return {
		uid: 'local:core',
		type: ModType.LOCAL,
		id: 'CoreMod',
		name: 'Core Mod',
		...overrides
	};
}

function createFooterContext(modData: ModData[], activeUids = modData.map((mod) => mod.uid)) {
	const mods = new SessionMods('', modData);
	const appState = createAppState({
		mods,
		activeCollection: { name: 'default', mods: activeUids }
	});
	setupDescriptors(mods, appState.config.userOverrides);
	const [currentRecord] = mods.foundMods;
	if (!currentRecord) {
		throw new Error('Expected a current footer mod record');
	}
	return { appState, currentRecord, mods };
}

describe('ModDetailsFooter', () => {
	beforeEach(() => {});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('shows the workshop id as the primary identity while keeping the mod id visible in inspect details', () => {
		const workshopMod = createWorkshopMod({
			workshopID: BigInt(42),
			id: 'HumanReadableModId',
			name: 'Workshop Title'
		});
		const { appState, currentRecord } = createFooterContext([workshopMod]);

		renderFooter(createFooterProps(appState, currentRecord, { activeTabKey: 'inspect', bigDetails: true }));

		expect(screen.getByText('42 (workshop:42)')).toBeInTheDocument();
		expect(screen.getAllByText('Mod ID').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Workshop ID').length).toBeGreaterThan(0);
		expect(screen.getAllByText(/^ID$/).length).toBeGreaterThan(0);
	});

	it('labels footer controls and preview content for accessibility', () => {
		const workshopMod = createWorkshopMod({
			workshopID: BigInt(42),
			id: 'HumanReadableModId',
			name: 'Workshop Title',
			preview: 'https://example.com/workshop-title.png'
		});
		const { appState, currentRecord } = createFooterContext([workshopMod]);

		renderFooter(createFooterProps(appState, currentRecord, { activeTabKey: 'info' }));

		expect(screen.getByRole('button', { name: 'Switch to side details panel' })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByRole('button', { name: 'Expand details to full view' })).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByRole('button', { name: 'Close details' })).toBeInTheDocument();
		expect(screen.getByText('Preview')).toBeInTheDocument();
		expect(screen.getByAltText('Workshop Title preview image')).toBeInTheDocument();
		expect(document.querySelector('.ModDetailFooterPreviewCol')).not.toBeInTheDocument();
	});

	it('shows pending dependency rows with the workshop id in the ID column while validation is stale', () => {
		const currentMod = createLocalMod({
			steamDependencies: [BigInt(11)]
		});
		const dependencyMod = createWorkshopMod({
			workshopID: BigInt(11),
			id: 'DependencyMod',
			name: 'Dependency Mod'
		});
		const { appState, currentRecord } = createFooterContext([currentMod, dependencyMod]);

		renderFooter(createFooterProps(appState, currentRecord, { lastValidationStatus: undefined }));

		expect(screen.getAllByText('ID').length).toBeGreaterThan(0);
		expect(screen.getByText('11')).toBeInTheDocument();
		expect(screen.getByText('Pending')).toBeInTheDocument();
	});

	it('retries workshop dependency lookup after leaving and reopening the dependencies tab', async () => {
		const { appState, currentRecord } = createFooterContext([createWorkshopMod()]);
		const fetchWorkshopDependencies = vi.fn(async () => ({ status: 'failed' as const }));
		Object.assign(window.electron, { fetchWorkshopDependencies });

		const footerProps = createFooterProps(appState, currentRecord);
		const { rerender } = renderFooter({
			...footerProps,
			activeTabKey: 'dependencies'
		});

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
		});

		rerender(<ModDetailsFooter {...footerProps} activeTabKey="info" />);

		rerender(<ModDetailsFooter {...footerProps} activeTabKey="dependencies" />);

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(2);
		});
	});

	it('remounts the tab panel when the active details tab changes', () => {
		const workshopMod = createWorkshopMod({
			workshopID: BigInt(42),
			id: 'AnimatedTabMod',
			name: 'Animated Tab Mod'
		});
		const { appState, currentRecord } = createFooterContext([workshopMod]);
		const footerProps = createFooterProps(appState, currentRecord);

		const { container, rerender } = renderFooter({
			...footerProps,
			activeTabKey: 'info'
		});
		const infoPanel = container.querySelector('.ModDetailTabsPanel');
		expect(infoPanel).not.toBeNull();

		rerender(<ModDetailsFooter {...footerProps} activeTabKey="inspect" />);

		const inspectPanel = container.querySelector('.ModDetailTabsPanel');
		expect(inspectPanel).not.toBeNull();
		expect(inspectPanel).not.toBe(infoPanel);
	});

	it('offers a same-tab retry after a workshop dependency lookup failure', async () => {
		const { appState, currentRecord } = createFooterContext([createWorkshopMod()]);
		const fetchWorkshopDependencies = vi
			.fn(async () => ({ status: 'failed' as const }))
			.mockResolvedValueOnce({ status: 'failed' as const })
			.mockResolvedValueOnce({ status: 'updated' as const });
		Object.assign(window.electron, { fetchWorkshopDependencies });

		renderFooter(createFooterProps(appState, currentRecord));

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
			expect(screen.getByRole('button', { name: 'Retry Workshop Dependency Lookup' })).toBeInTheDocument();
			expect(screen.getByText('Workshop dependency refresh failed')).toBeInTheDocument();
			expect(
				screen.getByText(
					'Could not refresh the Workshop dependency list for this mod. Retry to use the latest author-defined dependency data.'
				)
			).toBeInTheDocument();
		});
		fireEvent.click(screen.getByRole('button', { name: 'Retry Workshop Dependency Lookup' }));

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(2);
		});
	});

	it('shows unknown Workshop dependency metadata without presenting it as known empty', async () => {
		const { appState, currentRecord } = createFooterContext([createWorkshopMod()]);
		const fetchWorkshopDependencies = vi.fn(async () => ({ status: 'unknown' as const }));
		Object.assign(window.electron, { fetchWorkshopDependencies });

		const footerProps = createFooterProps(appState, currentRecord);
		const { rerender } = renderFooter(footerProps);

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
			expect(screen.queryByText('Workshop dependency refresh failed')).not.toBeInTheDocument();
			expect(screen.getByText('Steamworks did not provide Workshop dependency metadata for this mod.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
		});

		const freshDependencyTimestamp = Date.now();
		rerender(
			<ModDetailsFooter {...footerProps} currentRecord={{ ...currentRecord, steamDependenciesFetchedAt: freshDependencyTimestamp }} />
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
	});

	it('keeps stale known dependencies visible when Steamworks returns unknown metadata', async () => {
		const workshopMod = createWorkshopMod({
			steamDependencies: [BigInt(11)],
			steamDependenciesFetchedAt: Date.now() - WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS - 1
		});
		const { appState, currentRecord } = createFooterContext([workshopMod]);
		const fetchWorkshopDependencies = vi.fn(async () => ({ status: 'unknown' as const }));
		Object.assign(window.electron, { fetchWorkshopDependencies });

		renderFooter(createFooterProps(appState, currentRecord));

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
			expect(screen.getByText('Steamworks did not provide Workshop dependency metadata for this mod.')).toBeInTheDocument();
			expect(screen.getByText('11')).toBeInTheDocument();
			expect(screen.queryByText('Workshop dependency refresh failed')).not.toBeInTheDocument();
		});
	});

	it('refreshes stale workshop dependency snapshots when opening the dependencies tab', async () => {
		const workshopMod = createWorkshopMod({
			steamDependencies: [BigInt(11)],
			steamDependenciesFetchedAt: Date.now() - WORKSHOP_DEPENDENCY_SNAPSHOT_TTL_MS - 1
		});
		const { appState, currentRecord } = createFooterContext([workshopMod]);
		const fetchWorkshopDependencies = vi.fn(async () => ({ status: 'updated' as const }));
		Object.assign(window.electron, { fetchWorkshopDependencies });

		renderFooter(createFooterProps(appState, currentRecord));

		await waitFor(() => {
			expect(fetchWorkshopDependencies).toHaveBeenCalledTimes(1);
		});
	});

	it('shows known empty Workshop Dependency Snapshots separately from unknown metadata', async () => {
		const workshopMod = createWorkshopMod({
			id: 'EmptyDependencyMod',
			name: 'Empty Dependency Mod',
			steamDependencies: [],
			steamDependenciesFetchedAt: Date.now()
		});
		const { appState, currentRecord } = createFooterContext([workshopMod]);
		const fetchWorkshopDependencies = vi.fn(async () => ({ status: 'updated' as const }));
		Object.assign(window.electron, { fetchWorkshopDependencies });

		renderFooter(createFooterProps(appState, currentRecord));

		expect(screen.getByText('Steamworks reports no Workshop dependencies for this mod.')).toBeInTheDocument();
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(fetchWorkshopDependencies).not.toHaveBeenCalled();
	});

	it('does not update ignored validation config when persisting that change fails', async () => {
		const currentMod = createLocalMod({
			steamDependencies: [BigInt(11)]
		});
		const dependencyMod = createWorkshopMod({
			workshopID: BigInt(11),
			id: 'DependencyMod',
			name: 'Dependency Mod'
		});
		const { appState, currentRecord } = createFooterContext([currentMod, dependencyMod]);
		const validateCollection = vi.fn();
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(null);

		renderFooter(createFooterProps(appState, currentRecord, { validateCollection }));

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
