import { describe, expect, it } from 'vitest';
import { convertWorkshopDescriptionToHtml } from 'renderer/util/workshop-description';

describe('convertWorkshopDescriptionToHtml', () => {
	it('renders Steam heading tags instead of showing raw BBCode', () => {
		const html = convertWorkshopDescriptionToHtml('[h1]What is 0ModManager[/h1]\n\n[h2]IMPORTANT[/h2]');

		expect(html).toContain('<h1>What is 0ModManager</h1>');
		expect(html).toContain('<h2>IMPORTANT</h2>');
		expect(html).not.toContain('[h1]');
		expect(html).not.toContain('[h2]');
	});

	it('renders common inline tags and workshop links safely', () => {
		const html = convertWorkshopDescriptionToHtml(
			'Use [b]TTSMM[/b] with [i]care[/i]. [url=https://steamcommunity.com/sharedfiles/filedetails/?id=2790161231]Open workshop[/url]'
		);

		expect(html).toContain('<strong>TTSMM</strong>');
		expect(html).toContain('<em>care</em>');
		expect(html).toContain('href="https://steamcommunity.com/sharedfiles/filedetails/?id=2790161231"');
		expect(html).toContain('target="_blank"');
	});

	it('escapes raw html while still rendering supported workshop markup', () => {
		const html = convertWorkshopDescriptionToHtml('[h1]<script>alert(1)</script>[/h1]');

		expect(html).toContain('<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>');
		expect(html).not.toContain('<script>');
	});

	it('falls back to a meaningful generic alt label when no caption can be derived', () => {
		const html = convertWorkshopDescriptionToHtml('[img]https://example.com/22f30ba3c6.png[/img]');

		expect(html).toContain('alt="Workshop description image"');
		expect(html).toContain('decoding="async"');
	});

	it('derives alt text only from specific descriptive image filenames', () => {
		const html = convertWorkshopDescriptionToHtml('[img]https://example.com/mod-dependency-graph.png[/img]');

		expect(html).toContain('alt="mod dependency graph"');
		expect(html).toContain('decoding="async"');
	});

	it('lets callers provide a more specific image alt fallback', () => {
		const html = convertWorkshopDescriptionToHtml('[img]https://example.com/22f30ba3c6.png[/img]', {
			imageAltFallback: 'NuterraSteam workshop description image'
		});

		expect(html).toContain('alt="NuterraSteam workshop description image"');
	});
});
