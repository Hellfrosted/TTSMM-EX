import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockLookupColumnTitles } from '../../model';
import type { BlockLookupColumnConfig } from '../../renderer/block-lookup-column-definitions';
import {
	BLOCK_LOOKUP_TABLE_PADDING_WIDTH,
	BlockLookupHeaderCell,
	getBlockLookupCellAlignment,
	getBlockLookupColumnWidthStyle,
	getBlockLookupColumnWidthVariableName,
	getBlockLookupTableScrollWidth,
	getBlockLookupVirtualColumnStyle,
	getNextBlockLookupSortDirection,
	getResponsiveBlockLookupColumns,
	resolveBlockLookupColumnWidth,
	setBlockLookupColumnWidthVariable
} from '../../renderer/views/block-lookup-table-layout';

afterEach(() => {
	cleanup();
});

function createColumn(overrides: Partial<BlockLookupColumnConfig> = {}): BlockLookupColumnConfig {
	return {
		key: 'blockName',
		title: BlockLookupColumnTitles.BLOCK,
		visible: true,
		defaultWidth: 220,
		minWidth: 120,
		...overrides
	};
}

describe('block-lookup-table-layout', () => {
	it('resolves configured widths and exposes matching CSS variable helpers', () => {
		const column = createColumn({ width: 244 });
		const element = document.createElement('div');

		setBlockLookupColumnWidthVariable(element, column.key, 244);

		expect(resolveBlockLookupColumnWidth(column)).toBe(244);
		expect(resolveBlockLookupColumnWidth(createColumn({ width: undefined }))).toBe(220);
		expect(getBlockLookupColumnWidthVariableName('blockName')).toBe('--block-lookup-column-width-blockname');
		expect(getBlockLookupColumnWidthStyle('blockName', 244)).toBe('var(--block-lookup-column-width-blockname, 244px)');
		expect(getBlockLookupVirtualColumnStyle('var(--block-lookup-column-width-blockname, 244px)')).toEqual({
			width: 'var(--block-lookup-column-width-blockname, 244px)',
			flex: '0 0 var(--block-lookup-column-width-blockname, 244px)'
		});
		expect(element.style.getPropertyValue('--block-lookup-column-width-blockname')).toBe('244px');
	});

	it('adds table padding when calculating virtual table scroll width', () => {
		expect(
			getBlockLookupTableScrollWidth([
				createColumn({ key: 'preview', title: BlockLookupColumnTitles.PREVIEW, width: 92, defaultWidth: 92, minWidth: 76 }),
				createColumn({ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, width: 360, defaultWidth: 360, minWidth: 180 }),
				createColumn({ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, width: 220, defaultWidth: 220, minWidth: 120 })
			])
		).toBe(BLOCK_LOOKUP_TABLE_PADDING_WIDTH + 92 + 360 + 220);
	});

	it('keeps responsive columns within constrained widths', () => {
		const responsiveColumns = getResponsiveBlockLookupColumns(
			[
				createColumn({ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, width: 220, defaultWidth: 220, minWidth: 120 }),
				createColumn({ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, width: 360, defaultWidth: 360, minWidth: 180 }),
				createColumn({ key: 'internalName', title: BlockLookupColumnTitles.INTERNAL_NAME, width: 220, defaultWidth: 220, minWidth: 136 }),
				createColumn({ key: 'modTitle', title: BlockLookupColumnTitles.MOD, width: 200, defaultWidth: 200, minWidth: 120 }),
				createColumn({ key: 'preview', title: BlockLookupColumnTitles.PREVIEW, width: 92, defaultWidth: 92, minWidth: 76 })
			],
			560
		);

		expect(responsiveColumns.map((column) => column.key)).toEqual(['blockName', 'spawnCommand', 'internalName']);
		expect(responsiveColumns.reduce((totalWidth, column) => totalWidth + resolveBlockLookupColumnWidth(column), 32)).toBeLessThanOrEqual(
			560
		);
	});

	it('fills block lookup viewport width with flexible columns', () => {
		const responsiveColumns = getResponsiveBlockLookupColumns(
			[
				createColumn({ key: 'preview', title: BlockLookupColumnTitles.PREVIEW, width: 92, defaultWidth: 92, minWidth: 76 }),
				createColumn({ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, width: 220, defaultWidth: 220, minWidth: 120 }),
				createColumn({ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, width: 360, defaultWidth: 360, minWidth: 180 }),
				createColumn({ key: 'modTitle', title: BlockLookupColumnTitles.MOD, width: 200, defaultWidth: 200, minWidth: 120 })
			],
			1000
		);

		expect(responsiveColumns.find((column) => column.key === 'preview')?.width).toBe(92);
		expect(responsiveColumns.find((column) => column.key === 'spawnCommand')?.width).toBeGreaterThan(360);
		expect(responsiveColumns.find((column) => column.key === 'blockName')?.width).toBeGreaterThan(220);
		expect(responsiveColumns.find((column) => column.key === 'modTitle')?.width).toBeGreaterThan(200);
		expect((responsiveColumns.find((column) => column.key === 'spawnCommand')?.width || 0) - 360).toBeGreaterThan(
			(responsiveColumns.find((column) => column.key === 'blockName')?.width || 0) - 220
		);
		expect(responsiveColumns.reduce((totalWidth, column) => totalWidth + resolveBlockLookupColumnWidth(column), 32)).toBe(1000);
	});

	it('centers block lookup cells except block names', () => {
		expect(getBlockLookupCellAlignment('preview')).toBe('center');
		expect(getBlockLookupCellAlignment('spawnCommand')).toBe('center');
		expect(getBlockLookupCellAlignment('blockName')).toBe('left');
		expect(getBlockLookupCellAlignment('internalName')).toBe('center');
		expect(getBlockLookupCellAlignment('modTitle')).toBe('center');
	});

	it('cycles sort direction for table columns', () => {
		expect(getNextBlockLookupSortDirection('relevance', 'ascend', 'blockName')).toBe('ascend');
		expect(getNextBlockLookupSortDirection('blockName', 'ascend', 'blockName')).toBe('descend');
		expect(getNextBlockLookupSortDirection('blockName', 'descend', 'blockName')).toBe('ascend');
	});

	it('reports keyboard resize previews and completion', () => {
		const onResize = vi.fn();
		const onResizeEnd = vi.fn();
		render(
			<table>
				<thead>
					<tr>
						<BlockLookupHeaderCell label="Block" width={220} resizeWidth={220} minWidth={120} onResize={onResize} onResizeEnd={onResizeEnd}>
							Block
						</BlockLookupHeaderCell>
					</tr>
				</thead>
			</table>
		);

		fireEvent.keyDown(screen.getByRole('slider', { name: 'Resize Block' }), { key: 'ArrowRight' });

		expect(screen.getByRole('columnheader', { name: /Block/ })).toHaveStyle({
			width: '220px'
		});
		expect(onResize).toHaveBeenCalledWith(236);
		expect(onResizeEnd).toHaveBeenCalledWith(236);
	});

	it('keeps the header menu in the viewport and returns focus after selecting an item', () => {
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 160 });
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 120 });
		const onClick = vi.fn();

		render(
			<table>
				<thead>
					<tr>
						<BlockLookupHeaderCell
							label="Block"
							width={220}
							resizeWidth={220}
							minWidth={120}
							headerMenu={{
								items: [
									{ key: 'hide:blockName', label: 'Hide Block' },
									{ type: 'divider' },
									{ key: 'view-options', label: 'View Options' }
								],
								onClick
							}}
						>
							<button type="button">Block</button>
						</BlockLookupHeaderCell>
					</tr>
				</thead>
			</table>
		);

		const opener = screen.getByRole('button', { name: 'Block' });
		opener.focus();
		fireEvent.keyDown(opener, { key: 'ContextMenu' });

		const menu = screen.getByRole('menu', { name: 'Block column options' });
		expect(menu).toHaveStyle({ left: '8px', top: '8px' });
		expect(screen.getByRole('separator')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('menuitem', { name: 'Hide Block' }));

		expect(onClick).toHaveBeenCalledWith({ key: 'hide:blockName' });
		expect(opener).toHaveFocus();
		expect(screen.queryByRole('menu', { name: 'Block column options' })).not.toBeInTheDocument();
	});
});
