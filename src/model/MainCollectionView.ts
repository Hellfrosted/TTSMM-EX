export enum MainColumnTitles {
	TYPE = 'Type',
	NAME = 'Name',
	AUTHORS = 'Authors',
	STATE = 'State',
	ID = 'ID',
	SIZE = 'Size',
	LAST_UPDATE = 'Last Update',
	LAST_WORKSHOP_UPDATE = 'Workshop Update',
	DATE_ADDED = 'Date Added',
	TAGS = 'Tags'
}

const DEFAULT_MAIN_COLUMN_MIN_WIDTH = 64;

const MAIN_COLUMN_MIN_WIDTHS: Partial<Record<MainColumnTitles, number>> = {
	[MainColumnTitles.TYPE]: 56,
	[MainColumnTitles.NAME]: 144,
	[MainColumnTitles.AUTHORS]: 40,
	[MainColumnTitles.STATE]: 40,
	[MainColumnTitles.ID]: 32,
	[MainColumnTitles.SIZE]: 32
};

export function getMainColumnMinWidth(column: MainColumnTitles) {
	return MAIN_COLUMN_MIN_WIDTHS[column] ?? DEFAULT_MAIN_COLUMN_MIN_WIDTH;
}

export interface MainCollectionConfig {
	smallRows?: boolean;
	columnActiveConfig?: { [colID: string]: boolean };
	columnWidthConfig?: { [colID: string]: number };
	columnOrder?: string[];
	detailsOverlayWidth?: number;
	detailsOverlayHeight?: number;
}
