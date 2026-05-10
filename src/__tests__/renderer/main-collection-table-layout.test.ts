import { describe, expect, it } from 'vitest';
import { MainColumnTitles, type MainCollectionConfig } from '../../model';
import {
	DEFAULT_SELECTION_COLUMN_WIDTH,
	getColumnPixelWidth,
	getColumnWidthStyle,
	getColumnWidthVariableName,
	getColumnWidths,
	getMainCollectionTableScrollWidth,
	isMainColumnTitle,
	setColumnWidthVariable
} from '../../renderer/components/collections/main-collection-table-layout';

describe('main-collection-table-layout', () => {
	it('uses the lower per-column minimums and gives unsaved extra width to Name instead of Tags', () => {
		const autoColumnWidths: Record<string, number> = {
			[MainColumnTitles.TYPE]: 65,
			[MainColumnTitles.NAME]: 300,
			[MainColumnTitles.AUTHORS]: 24,
			[MainColumnTitles.STATE]: 28,
			[MainColumnTitles.ID]: 20,
			[MainColumnTitles.SIZE]: 16,
			[MainColumnTitles.LAST_UPDATE]: 130,
			[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 130,
			[MainColumnTitles.DATE_ADDED]: 130,
			[MainColumnTitles.TAGS]: 200
		};

		const widths = getColumnWidths(undefined, autoColumnWidths, 1400);
		expect(widths[MainColumnTitles.AUTHORS]).toBe(40);
		expect(widths[MainColumnTitles.STATE]).toBe(40);
		expect(widths[MainColumnTitles.ID]).toBe(32);
		expect(widths[MainColumnTitles.SIZE]).toBe(32);
		expect(widths[MainColumnTitles.TAGS]).toBe(200);
		expect(widths[MainColumnTitles.NAME]).toBe(553);
	});

	it('does not override a saved Name width when filling the table', () => {
		const config: MainCollectionConfig = {
			columnWidthConfig: {
				[MainColumnTitles.NAME]: 320
			}
		};
		const autoColumnWidths: Record<string, number> = {
			[MainColumnTitles.TYPE]: 65,
			[MainColumnTitles.NAME]: 300,
			[MainColumnTitles.AUTHORS]: 64,
			[MainColumnTitles.STATE]: 64,
			[MainColumnTitles.ID]: 52,
			[MainColumnTitles.SIZE]: 52,
			[MainColumnTitles.LAST_UPDATE]: 130,
			[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 130,
			[MainColumnTitles.DATE_ADDED]: 130,
			[MainColumnTitles.TAGS]: 200
		};

		const widths = getColumnWidths(config, autoColumnWidths, 1400);
		expect(widths[MainColumnTitles.NAME]).toBe(320);
	});

	it('uses tighter fallback widths when auto measurement is unavailable', () => {
		const widths = getColumnWidths(undefined, {}, 0);

		expect(widths[MainColumnTitles.TYPE]).toBe(56);
		expect(widths[MainColumnTitles.NAME]).toBe(288);
		expect(widths[MainColumnTitles.AUTHORS]).toBe(120);
		expect(widths[MainColumnTitles.STATE]).toBe(112);
		expect(widths[MainColumnTitles.ID]).toBe(132);
		expect(widths[MainColumnTitles.SIZE]).toBe(72);
		expect(widths[MainColumnTitles.LAST_UPDATE]).toBe(116);
		expect(widths[MainColumnTitles.LAST_WORKSHOP_UPDATE]).toBe(116);
		expect(widths[MainColumnTitles.DATE_ADDED]).toBe(116);
		expect(widths[MainColumnTitles.TAGS]).toBe(180);
	});

	it('drops low-priority columns first when the available table width is narrow', () => {
		const autoColumnWidths: Record<string, number> = {
			[MainColumnTitles.TYPE]: 65,
			[MainColumnTitles.NAME]: 300,
			[MainColumnTitles.AUTHORS]: 80,
			[MainColumnTitles.STATE]: 120,
			[MainColumnTitles.ID]: 52,
			[MainColumnTitles.SIZE]: 52,
			[MainColumnTitles.LAST_UPDATE]: 130,
			[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 130,
			[MainColumnTitles.DATE_ADDED]: 130,
			[MainColumnTitles.TAGS]: 200
		};

		const widths = getColumnWidths(undefined, autoColumnWidths, 900);

		expect(widths[MainColumnTitles.TYPE]).toBe(65);
		expect(widths[MainColumnTitles.NAME]).toBeGreaterThanOrEqual(300);
		expect(widths[MainColumnTitles.AUTHORS]).toBe(80);
		expect(widths[MainColumnTitles.STATE]).toBe(120);
		expect(widths[MainColumnTitles.ID]).toBe(52);
		expect(widths[MainColumnTitles.SIZE]).toBeUndefined();
		expect(widths[MainColumnTitles.LAST_UPDATE]).toBeUndefined();
		expect(widths[MainColumnTitles.LAST_WORKSHOP_UPDATE]).toBeUndefined();
		expect(widths[MainColumnTitles.DATE_ADDED]).toBeUndefined();
		expect(widths[MainColumnTitles.TAGS]).toBeUndefined();
	});

	it('normalizes css variable names for persisted column widths', () => {
		const element = document.createElement('div');

		expect(isMainColumnTitle(MainColumnTitles.LAST_WORKSHOP_UPDATE)).toBe(true);
		expect(getColumnWidthVariableName(MainColumnTitles.LAST_WORKSHOP_UPDATE)).toBe('--main-collection-column-width-workshop-update');
		expect(getColumnWidthStyle(MainColumnTitles.LAST_WORKSHOP_UPDATE, 116)).toBe(
			'var(--main-collection-column-width-workshop-update, 116px)'
		);

		setColumnWidthVariable(element, MainColumnTitles.LAST_WORKSHOP_UPDATE, 144);
		expect(element.style.getPropertyValue('--main-collection-column-width-workshop-update')).toBe('144px');
	});

	it('resolves rendered column pixel widths from resize, number, css variable, and fallback values', () => {
		expect(getColumnPixelWidth({ resizeWidth: 222, width: 111 })).toBe(222);
		expect(getColumnPixelWidth({ width: 144 })).toBe(144);
		expect(getColumnPixelWidth({ width: 'var(--main-collection-column-width-name, 288px)' })).toBe(288);
		expect(getColumnPixelWidth({ width: 'min-content' })).toBe(120);
	});

	it('adds the selection column when calculating virtual table scroll width', () => {
		expect(
			getMainCollectionTableScrollWidth({
				[MainColumnTitles.NAME]: 320,
				[MainColumnTitles.ID]: 132
			})
		).toBe(DEFAULT_SELECTION_COLUMN_WIDTH + 320 + 132);
	});
});
