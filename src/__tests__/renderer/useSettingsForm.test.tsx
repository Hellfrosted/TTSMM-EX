import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppConfigKeys, LogLevel, SettingsViewModalType } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import { useSettingsForm } from '../../renderer/hooks/useSettingsForm';
import { createAppState } from './test-utils';

describe('useSettingsForm', () => {
	it('selects a settings path through the promise-based preload API', async () => {
		const appState = createAppState();
		vi.mocked(window.electron.selectPath).mockResolvedValueOnce('C:\\Games\\TerraTech\\LocalMods');

		const { result } = renderHook(() => useSettingsForm(appState));

		await act(async () => {
			await result.current.selectPath(AppConfigKeys.LOCAL_DIR, true, 'Select TerraTech LocalMods directory');
		});

		expect(window.electron.selectPath).toHaveBeenCalledWith(true, 'Select TerraTech LocalMods directory');
		expect(result.current.editingConfig.localDir).toBe('C:\\Games\\TerraTech\\LocalMods');
	});

	it('resets settings edits back to the saved config', () => {
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				localDir: 'C:\\TerraTech\\LocalMods',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			}
		});
		const { result } = renderHook(() => useSettingsForm(appState));

		act(() => {
			result.current.setField(AppConfigKeys.LOCAL_DIR, 'D:\\Temp\\LocalMods');
		});

		expect(appState.updateState).toHaveBeenCalledWith({ madeConfigEdits: true });
		expect(result.current.editingConfig.localDir).toBe('D:\\Temp\\LocalMods');

		act(() => {
			result.current.cancelChanges();
		});

		expect(result.current.editingConfig.localDir).toBe('C:\\TerraTech\\LocalMods');
		expect(result.current.modalType).toBe(SettingsViewModalType.NONE);
		expect(appState.updateState).toHaveBeenCalledWith({ madeConfigEdits: false });
	});

	it('clears config errors after saving settings changes', async () => {
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				gameExec: 'C:\\Games\\TerraTech\\TerraTechWin64.exe',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			},
			configErrors: {
				gameExec: 'old error'
			}
		});
		const { result } = renderHook(() => useSettingsForm(appState));

		act(() => {
			result.current.setField(AppConfigKeys.GAME_EXEC, 'D:\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe');
		});

		await act(async () => {
			await result.current.saveChanges();
		});

		expect(window.electron.updateConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				gameExec: 'D:\\Steam\\steamapps\\common\\TerraTech\\TerraTechWin64.exe'
			})
		);
		expect(appState.configErrors).toEqual({});
	});

	it('does not mark mods for reload when saving settings fails', async () => {
		const appState = createAppState({
			firstModLoad: true,
			config: {
				...DEFAULT_CONFIG,
				localDir: 'C:\\TerraTech\\LocalMods',
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			}
		});
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false);
		const { result } = renderHook(() => useSettingsForm(appState));

		act(() => {
			result.current.setField(AppConfigKeys.LOCAL_DIR, 'D:\\Other\\LocalMods');
		});

		await act(async () => {
			await result.current.saveChanges();
		});

		expect(appState.firstModLoad).toBe(true);
		expect(appState.config.localDir).toBe('C:\\TerraTech\\LocalMods');
		expect(appState.madeConfigEdits).toBe(true);
	});

	it('applies log level only after a successful save', async () => {
		const appState = createAppState({
			config: {
				...DEFAULT_CONFIG,
				logLevel: LogLevel.WARN,
				viewConfigs: {},
				ignoredValidationErrors: new Map(),
				userOverrides: new Map()
			}
		});
		const updateLogLevel = vi.fn();
		window.electron.updateLogLevel = updateLogLevel;
		vi.mocked(window.electron.updateConfig).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const { result } = renderHook(() => useSettingsForm(appState));

		act(() => {
			result.current.setField('logLevel', LogLevel.DEBUG);
		});

		expect(updateLogLevel).not.toHaveBeenCalled();

		await act(async () => {
			await result.current.saveChanges();
		});

		expect(updateLogLevel).not.toHaveBeenCalled();
		expect(appState.config.logLevel).toBe(LogLevel.WARN);

		await act(async () => {
			await result.current.saveChanges();
		});

		expect(updateLogLevel).toHaveBeenCalledWith(LogLevel.DEBUG);
		expect(appState.config.logLevel).toBe(LogLevel.DEBUG);
	});
});
