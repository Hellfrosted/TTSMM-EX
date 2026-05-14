import { describe, expect, it } from 'vitest';
import { BlockLookupColumnTitles } from '../../model';
import type { BlockLookupColumnConfig } from '../../renderer/block-lookup-column-definitions';
import {
	createBlockLookupTableWorkspaceState,
	getBlockLookupKeyboardNavigationIndex,
	getNextBlockLookupSortDirection,
	reduceBlockLookupTableWorkspace
} from '../../renderer/block-lookup-table-workspace';

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

describe('block-lookup-table-workspace', () => {
	it('owns table options draft and transient drag state', () => {
		const initialState = createBlockLookupTableWorkspaceState({ columnConfig: [createColumn()], smallRows: false });
		const draftColumns = [createColumn({ key: 'spawnCommand', title: BlockLookupColumnTitles.SPAWN_COMMAND })];
		const openedState = reduceBlockLookupTableWorkspace(initialState, {
			type: 'table-options-opened',
			draft: { columns: draftColumns, smallRows: true }
		});
		const draggingState = reduceBlockLookupTableWorkspace(openedState, {
			type: 'dragging-draft-column-changed',
			columnKey: 'spawnCommand'
		});

		expect(openedState).toEqual(
			expect.objectContaining({
				draftColumnConfig: draftColumns,
				draftSmallRows: true,
				tableOptionsOpen: true
			})
		);
		expect(draggingState.draggingDraftColumnKey).toBe('spawnCommand');
		expect(reduceBlockLookupTableWorkspace(draggingState, { type: 'table-options-closed' }).tableOptionsOpen).toBe(false);
	});

	it('cycles table sort direction for Atom adapters', () => {
		expect(getNextBlockLookupSortDirection('relevance', 'ascend', 'blockName')).toBe('ascend');
		expect(getNextBlockLookupSortDirection('blockName', 'ascend', 'blockName')).toBe('descend');
		expect(getNextBlockLookupSortDirection('blockName', 'descend', 'blockName')).toBe('ascend');
	});

	it('maps keyboard navigation to visible row indexes', () => {
		expect(getBlockLookupKeyboardNavigationIndex('ArrowDown', undefined, 3)).toBe(0);
		expect(getBlockLookupKeyboardNavigationIndex('ArrowDown', 1, 3)).toBe(2);
		expect(getBlockLookupKeyboardNavigationIndex('ArrowDown', 2, 3)).toBe(2);
		expect(getBlockLookupKeyboardNavigationIndex('ArrowUp', 0, 3)).toBe(0);
		expect(getBlockLookupKeyboardNavigationIndex('Home', 2, 3)).toBe(0);
		expect(getBlockLookupKeyboardNavigationIndex('End', 0, 3)).toBe(2);
		expect(getBlockLookupKeyboardNavigationIndex('PageDown', 0, 3)).toBeUndefined();
		expect(getBlockLookupKeyboardNavigationIndex('ArrowDown', 0, 0)).toBeUndefined();
	});
});
