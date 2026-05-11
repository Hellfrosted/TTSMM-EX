import { describe, expect, it } from 'vitest';
import {
	BLOCK_LOOKUP_VIRTUAL_ROW_HEIGHT,
	COMPACT_VIRTUAL_ROW_HEIGHT,
	getVirtualTableColumnPixelWidth,
	getVirtualTableColumnWidthStyle,
	getVirtualTableColumnWidthVariableName,
	getVirtualTableFixedColumnStyle,
	getVirtualTableRowHeight,
	getVirtualTableScrollWidth,
	MAIN_COLLECTION_VIRTUAL_ROW_HEIGHT,
	setVirtualTableColumnWidthVariable,
	VIRTUAL_TABLE_OVERSCAN
} from '../../renderer/virtual-table-geometry';

describe('virtual-table-geometry', () => {
	it('normalizes stable css variable names and width expressions', () => {
		const element = document.createElement('div');

		expect(getVirtualTableColumnWidthVariableName('main-collection', 'Workshop Update')).toBe(
			'--main-collection-column-width-workshop-update'
		);
		expect(getVirtualTableColumnWidthVariableName('block-lookup', 'blockName')).toBe('--block-lookup-column-width-blockname');
		expect(getVirtualTableColumnWidthStyle('block-lookup', 'blockName', 244)).toBe('var(--block-lookup-column-width-blockname, 244px)');

		setVirtualTableColumnWidthVariable(element, 'block-lookup', 'blockName', 244);
		expect(element.style.getPropertyValue('--block-lookup-column-width-blockname')).toBe('244px');
	});

	it('uses fixed flex-basis semantics for virtualized cells', () => {
		expect(getVirtualTableFixedColumnStyle(144)).toEqual({
			width: 144,
			flex: '0 0 144px'
		});
		expect(getVirtualTableFixedColumnStyle('var(--main-collection-column-width-name, 288px)')).toEqual({
			width: 'var(--main-collection-column-width-name, 288px)',
			flex: '0 0 var(--main-collection-column-width-name, 288px)'
		});
	});

	it('resolves pixel widths from resize, numeric, css variable, and fallback values', () => {
		expect(getVirtualTableColumnPixelWidth({ resizeWidth: 222, width: 111 })).toBe(222);
		expect(getVirtualTableColumnPixelWidth({ width: 144 })).toBe(144);
		expect(getVirtualTableColumnPixelWidth({ width: 'var(--main-collection-column-width-name, 288px)' })).toBe(288);
		expect(getVirtualTableColumnPixelWidth({ width: 'min-content' })).toBe(120);
		expect(getVirtualTableColumnPixelWidth({ width: 'min-content' }, 96)).toBe(96);
	});

	it('adds fixed leading or padding columns to scroll width', () => {
		expect(getVirtualTableScrollWidth([320, 132], 48)).toBe(500);
		expect(getVirtualTableScrollWidth([360, 220], 32)).toBe(612);
	});

	it('owns fixed virtual row heights and conservative overscan for scrolling tables', () => {
		expect(VIRTUAL_TABLE_OVERSCAN).toBe(8);
		expect(MAIN_COLLECTION_VIRTUAL_ROW_HEIGHT).toBe(48);
		expect(BLOCK_LOOKUP_VIRTUAL_ROW_HEIGHT).toBe(44);
		expect(COMPACT_VIRTUAL_ROW_HEIGHT).toBe(34);
		expect(getVirtualTableRowHeight({ compact: false, coarsePointer: false, regularHeight: MAIN_COLLECTION_VIRTUAL_ROW_HEIGHT })).toBe(48);
		expect(getVirtualTableRowHeight({ compact: true, coarsePointer: false, regularHeight: MAIN_COLLECTION_VIRTUAL_ROW_HEIGHT })).toBe(34);
		expect(getVirtualTableRowHeight({ compact: true, coarsePointer: true, regularHeight: BLOCK_LOOKUP_VIRTUAL_ROW_HEIGHT })).toBe(44);
	});
});
