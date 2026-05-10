import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockLookupColumnTitles } from '../../model';
import {
	BlockLookupHeaderCell,
	getBlockLookupColumnWidthStyle,
	getBlockLookupColumnWidthVariableName,
	getNextBlockLookupSortDirection,
	getResponsiveBlockLookupColumns,
	resolveBlockLookupColumnWidth,
	setBlockLookupColumnWidthVariable
} from '../../renderer/views/block-lookup-table-layout';
import type { BlockLookupColumnConfig } from '../../renderer/view-config-persistence';

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
		expect(element.style.getPropertyValue('--block-lookup-column-width-blockname')).toBe('244px');
	});

	it('keeps responsive columns within constrained widths', () => {
		const responsiveColumns = getResponsiveBlockLookupColumns(
			[
				createColumn({ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND, width: 360, defaultWidth: 360, minWidth: 180 }),
				createColumn({ key: 'blockName', title: BlockLookupColumnTitles.BLOCK, width: 220, defaultWidth: 220, minWidth: 120 }),
				createColumn({ key: 'modTitle', title: BlockLookupColumnTitles.MOD, width: 200, defaultWidth: 200, minWidth: 120 }),
				createColumn({ key: 'blockId', title: BlockLookupColumnTitles.BLOCK_ID, width: 110, defaultWidth: 110, minWidth: 90 }),
				createColumn({ key: 'sourceKind', title: BlockLookupColumnTitles.SOURCE, width: 130, defaultWidth: 130, minWidth: 90 })
			],
			640
		);

		expect(responsiveColumns.map((column) => column.key)).toEqual(['spawnCommand', 'blockName', 'modTitle', 'blockId', 'sourceKind']);
		expect(responsiveColumns.reduce((totalWidth, column) => totalWidth + resolveBlockLookupColumnWidth(column), 32)).toBeLessThanOrEqual(
			640
		);
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

		expect(onResize).toHaveBeenCalledWith(236);
		expect(onResizeEnd).toHaveBeenCalledWith(236);
	});
});
