import { describe, expect, it } from 'vitest';
import { isAllowedExternalUrl } from '../../main/external-links';

describe('external links', () => {
	it('allows only expected external URL protocols and hosts', () => {
		expect(isAllowedExternalUrl('steam://url/CommunityFilePage/123')).toBe(true);
		expect(isAllowedExternalUrl('https://steamcommunity.com/sharedfiles/filedetails/?id=123')).toBe(true);
		expect(isAllowedExternalUrl('https://github.com/Hellfrosted/terratech-steam-mod-loader/issues')).toBe(true);
		expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
		expect(isAllowedExternalUrl('https://example.com')).toBe(false);
	});
});
