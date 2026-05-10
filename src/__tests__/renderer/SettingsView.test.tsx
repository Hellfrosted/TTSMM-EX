import React from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppConfigKeys, type AppState, LogLevel } from '../../model';
import { SettingsView } from '../../renderer/views/SettingsView';
import { createAppState, createTestConfig, renderWithQueryClient } from './test-utils';

function renderSettingsView(overrides: Parameters<typeof createAppState>[0] = {}) {
	const appRoot = document.createElement('div');
	appRoot.className = 'AppRoot';
	document.body.appendChild(appRoot);
	const appState = createAppState({
		config: createTestConfig({ currentPath: '/settings' }),
		...overrides
	});
	const updateState = appState.updateState;

	function SettingsHarness() {
		const [state, setState] = React.useState(appState);
		const updateHarnessState = React.useCallback((props: Partial<AppState>) => {
			updateState(props);
			setState((currentState) => ({
				...currentState,
				...props
			}));
		}, []);

		return <SettingsView appState={{ ...state, updateState: updateHarnessState }} />;
	}

	return {
		appState,
		...renderWithQueryClient(<SettingsHarness />, { container: appRoot })
	};
}

afterEach(() => {
	cleanup();
});

describe('SettingsView', () => {
	it('toggles close-on-launch through the shared switch control', () => {
		renderSettingsView();

		const closeOnLaunchSwitch = screen.getByRole('checkbox', { name: 'Close the app after launching TerraTech' });
		expect(closeOnLaunchSwitch).not.toBeChecked();

		fireEvent.click(closeOnLaunchSwitch);

		expect(closeOnLaunchSwitch).toBeChecked();
	});

	it('saves NuterraSteam compatibility edits through the settings form', async () => {
		const { container } = renderSettingsView({ madeConfigEdits: true });

		const compatibilitySwitch = screen.getByRole('checkbox', { name: 'Treat NuterraSteam and NuterraSteam Beta as equivalent' });
		expect(compatibilitySwitch).toBeChecked();

		fireEvent.click(compatibilitySwitch);
		expect(compatibilitySwitch).not.toBeChecked();
		fireEvent.submit(container.querySelector('form') as HTMLFormElement);

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					treatNuterraSteamBetaAsEquivalent: false
				})
			);
		});
	});

	it('saves path and log-level edits through the settings form', async () => {
		const { appState } = renderSettingsView();

		fireEvent.change(screen.getByLabelText('Local Mods Folder'), {
			target: { value: 'C:\\Games\\TerraTech\\LocalMods' }
		});
		fireEvent.change(screen.getByLabelText('App logging level'), {
			target: { value: LogLevel.DEBUG }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					[AppConfigKeys.LOCAL_DIR]: 'C:\\Games\\TerraTech\\LocalMods',
					logLevel: LogLevel.DEBUG
				})
			);
		});
		expect(appState.configErrors).toEqual({});
	});

	it('blocks save and surfaces duplicate logger override errors', async () => {
		renderSettingsView({
			madeConfigEdits: true,
			config: createTestConfig({
				currentPath: '/settings',
				logParams: {
					TTSMM: 'debug',
					TTSMMChild: 'trace'
				}
			})
		});

		fireEvent.click(screen.getByRole('button', { name: 'Edit logger override 2' }));
		fireEvent.change(screen.getByLabelText('Logger ID'), {
			target: { value: 'TTSMM' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(await screen.findAllByText('Duplicate logger IDs')).toHaveLength(2);
		const overrideInput = screen.getByLabelText('Override 2');
		expect(overrideInput).toHaveAttribute('aria-invalid', 'true');
		expect(overrideInput).toHaveAccessibleDescription('Duplicate logger IDs');
		expect(window.electron.updateConfig).not.toHaveBeenCalled();
	});

	it('allows logger override validation errors to be fixed and saved', async () => {
		renderSettingsView({
			madeConfigEdits: true,
			config: createTestConfig({
				currentPath: '/settings',
				logParams: {
					TTSMM: 'debug',
					TTSMMChild: 'trace'
				}
			})
		});

		fireEvent.click(screen.getByRole('button', { name: 'Edit logger override 2' }));
		fireEvent.change(screen.getByLabelText('Logger ID'), {
			target: { value: 'TTSMM' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(await screen.findAllByText('Duplicate logger IDs')).toHaveLength(2);
		expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();

		fireEvent.click(screen.getByRole('button', { name: 'Edit logger override 2' }));
		fireEvent.change(screen.getByLabelText('Logger ID'), {
			target: { value: 'TTSMMChildFixed' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => {
			expect(window.electron.updateConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					logParams: {
						TTSMM: 'debug',
						TTSMMChildFixed: 'trace'
					}
				})
			);
		});
	});
});
