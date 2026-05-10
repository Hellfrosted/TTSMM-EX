export enum BlockLookupColumnTitles {
	SPAWN_COMMAND = 'SpawnBlock Command',
	BLOCK = 'Block',
	MOD = 'Mod',
	BLOCK_ID = 'Block ID',
	SOURCE = 'Source'
}

export interface BlockLookupViewConfig {
	smallRows?: boolean;
	columnActiveConfig?: { [colID: string]: boolean };
	columnWidthConfig?: { [colID: string]: number };
	columnOrder?: string[];
}
