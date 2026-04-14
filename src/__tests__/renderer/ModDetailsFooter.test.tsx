import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModType, SessionMods, setupDescriptors } from '../../model';
import ModDetailsFooter from '../../renderer/components/collections/ModDetailsFooter';
import { createAppState } from './test-utils';

function renderFooter(props: React.ComponentProps<typeof ModDetailsFooter>) {
	return render(<ModDetailsFooter {...props} />);
}

describe('ModDetailsFooter', () => {
	beforeEach(() => {
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
	});

	it('shows workshop ids in the footer identity and inspect details without ambiguous ID labels', () => {
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

		expect(screen.getByText('Workshop ID 42 (workshop:42)')).toBeInTheDocument();
		expect(screen.getAllByText('Mod ID').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Workshop ID').length).toBeGreaterThan(0);
		expect(screen.queryByText(/^ID$/)).not.toBeInTheDocument();
	});

	it('shows pending dependency rows with a workshop-id column while validation is stale', () => {
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

		expect(screen.getAllByText('Workshop ID').length).toBeGreaterThan(0);
		expect(screen.getByText('11')).toBeInTheDocument();
		expect(screen.getByText('Pending')).toBeInTheDocument();
	});
});
