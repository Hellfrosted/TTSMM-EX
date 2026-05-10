import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../model';
import { DEFAULT_CONFIG } from '../../renderer/Constants';
import {
	describeStartupBootError,
	normalizeStartupPath,
	resolveStartupNavigation,
	shouldAutoDiscoverGameExec
} from '../../renderer/startup-loading';

function config(overrides: Partial<AppConfig> = {}): AppConfig {
	return {
		...DEFAULT_CONFIG,
		currentPath: '/collections/main',
		viewConfigs: {},
		ignoredValidationErrors: new Map(),
		userOverrides: new Map(),
		...overrides
	};
}

describe('startup-loading', () => {
	it('normalizes unsupported startup routes to the collection workspace', () => {
		expect(normalizeStartupPath(undefined)).toBe('/collections/main');
		expect(normalizeStartupPath('collections/main')).toBe('/collections/main');
		expect(normalizeStartupPath('/collections')).toBe('/collections/main');
		expect(normalizeStartupPath('/settings')).toBe('/collections/main');
		expect(normalizeStartupPath('/block-lookup')).toBe('/collections/main');
		expect(normalizeStartupPath('/collections/main')).toBe('/collections/main');
	});

	it('detects when startup should auto-discover the game executable', () => {
		expect(shouldAutoDiscoverGameExec(config({ gameExec: '' }), true, 'win32')).toBe(true);
		expect(shouldAutoDiscoverGameExec(config({ gameExec: DEFAULT_CONFIG.gameExec }), false, 'win32')).toBe(true);
		expect(shouldAutoDiscoverGameExec(config({ gameExec: 'D:\\Games\\TerraTech.exe' }), true, 'win32')).toBe(false);
		expect(shouldAutoDiscoverGameExec(config({ gameExec: '' }), true, 'linux')).toBe(false);
	});

	it('routes invalid configs to settings without loading mods', () => {
		const navigation = resolveStartupNavigation(config({ currentPath: '/collections/main' }), {
			gameExec: 'Missing executable'
		});

		expect(navigation.path).toBe('/settings');
		expect(navigation.loadingMods).toBe(false);
		expect(navigation.config.currentPath).toBe('/settings');
	});

	it('normalizes valid startup navigation and enables mod loading', () => {
		const navigation = resolveStartupNavigation(config({ currentPath: '/settings' }), {});

		expect(navigation.path).toBe('/collections/main');
		expect(navigation.loadingMods).toBe(true);
		expect(navigation.config.currentPath).toBe('/collections/main');
	});

	it('describes known boot failures with actionable copy', () => {
		expect(describeStartupBootError('Failed to load config file').title).toContain('could not read');
		expect(describeStartupBootError('Failed to persist the default collection during boot').detail).toContain('writable');
		expect(describeStartupBootError('').title).toBe('Startup needs attention.');
	});
});
