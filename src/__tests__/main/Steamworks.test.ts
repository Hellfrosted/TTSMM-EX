import { describe, expect, it } from 'vitest';
import { normalizeWorkshopItem } from '../../main/steamworks/steamworks';

describe('Steamworks workshop metadata', () => {
	it('normalizes Steam tag objects from published file details', () => {
		const details = normalizeWorkshopItem({
			publishedFileId: '2562828247',
			title: 'AA Guns',
			tags: [{ tag: 'Hawkeye' }, { tag: 'Mods' }, { tag: 'Blocks' }]
		});

		expect(details).toMatchObject({
			publishedFileId: BigInt(2562828247),
			title: 'AA Guns',
			tags: ['Hawkeye', 'Mods', 'Blocks'],
			tagsDisplayNames: ['Hawkeye', 'Mods', 'Blocks']
		});
	});
});
