import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppConfigKeys, LogLevel } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { SettingsView } from '../../renderer/views/SettingsView';
import { createAppState } from './test-utils';

function renderSettingsView(overrides: Parameters<typeof createAppState>[0] = {}) {
	const appState = createAppState({
		config: {
			...DEFAULT_CONFIG,
			currentPath: '/settings',
			viewConfigs: {},
			ignoredValidationErrors: new Map(),
			userOverrides: new Map()
		},
		...overrides
	});

	return {
		appState,
		...render(<SettingsView appState={appState} />)
	};
}

afterEach(() => {
	cleanup();
});

describe('SettingsView', () => {
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
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/settings',
				logParams: {
					TTSMM: 'debug',
					TTSMMChild: 'trace'
				},
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			}
		});

		fireEvent.click(screen.getByRole('button', { name: 'Edit logger override 2' }));
		fireEvent.change(screen.getByLabelText('Logger ID'), {
			target: { value: 'TTSMM' }
		});
		fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		expect(await screen.findAllByText('Duplicate logger IDs')).toHaveLength(2);
		expect(window.electron.updateConfig).not.toHaveBeenCalled();
	});

	it('allows logger override validation errors to be fixed and saved', async () => {
		renderSettingsView({
			madeConfigEdits: true,
			config: {
				...DEFAULT_CONFIG,
				currentPath: '/settings',
				logParams: {
					TTSMM: 'debug',
					TTSMMChild: 'trace'
				},
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			}
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
