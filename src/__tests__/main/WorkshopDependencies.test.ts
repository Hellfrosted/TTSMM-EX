import { describe, expect, it } from 'vitest';
import { parseWorkshopDependencyLookup } from '../../main/workshop-dependencies';

describe('workshop dependency parsing', () => {
	it('extracts required item ids and names from workshop html', () => {
		const html = `
			<div class="rightSectionTopTitle">Required items</div>
			<div class="requiredItemsContainer" id="RequiredItems">
				<a href="https://steamcommunity.com/workshop/filedetails/?id=2790966966" target="_blank">
					<div class="requiredItem">NuterraSteam (Beta)</div>
				</a>
				<a href="https://steamcommunity.com/workshop/filedetails/?id=2571814511" target="_blank">
					<div class="requiredItem">Harmony (2.2.2)</div>
				</a>
			</div>
		`;

		expect(parseWorkshopDependencyLookup(html)).toEqual({
			steamDependencies: [BigInt(2790966966), BigInt(2571814511)],
			steamDependencyNames: {
				'2571814511': 'Harmony (2.2.2)',
				'2790966966': 'NuterraSteam (Beta)'
			}
		});
	});

	it('returns an empty dependency list when the workshop page has no required items section', () => {
		expect(parseWorkshopDependencyLookup('<html><body><div>No dependencies here</div></body></html>')).toEqual({
			steamDependencies: []
		});
	});
});
