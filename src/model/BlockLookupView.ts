export enum BlockLookupColumnTitles {
	PREVIEW = 'Preview',
	SPAWN_COMMAND = 'SpawnBlock Command',
	BLOCK = 'Block',
	INTERNAL_NAME = 'Internal block name',
	MOD = 'Mod'
}

export interface BlockLookupViewConfig {
	smallRows?: boolean;
	columnActiveConfig?: { [colID: string]: boolean };
	columnWidthConfig?: { [colID: string]: number };
	columnOrder?: string[];
}
