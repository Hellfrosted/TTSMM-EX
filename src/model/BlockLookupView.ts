export enum BlockLookupColumnTitles {
	PREVIEW = 'Preview',
	SPAWN_COMMAND = 'SpawnBlock Command',
	BLOCK = 'Block',
	INTERNAL_NAME = 'Internal block name',
	MOD = 'Mod'
}

export const BLOCK_LOOKUP_COLUMN_KEYS = ['blockName', 'spawnCommand', 'internalName', 'modTitle', 'preview'] as const;
export type BlockLookupColumnKey = (typeof BLOCK_LOOKUP_COLUMN_KEYS)[number];
export const BLOCK_LOOKUP_COLUMN_TITLES: Record<BlockLookupColumnKey, BlockLookupColumnTitles> = {
	preview: BlockLookupColumnTitles.PREVIEW,
	spawnCommand: BlockLookupColumnTitles.SPAWN_COMMAND,
	blockName: BlockLookupColumnTitles.BLOCK,
	internalName: BlockLookupColumnTitles.INTERNAL_NAME,
	modTitle: BlockLookupColumnTitles.MOD
};

export interface BlockLookupViewConfig {
	smallRows?: boolean;
	columnActiveConfig?: { [colID: string]: boolean };
	columnWidthConfig?: { [colID: string]: number };
	columnOrder?: string[];
}
