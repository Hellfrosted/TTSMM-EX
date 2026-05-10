import { MainColumnTitles } from 'model';

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

function getHeaderMinimumWidth(column: MainColumnTitles) {
	return Math.ceil(column.length * 8 + 34);
}

export function getResolvedMainColumnMinWidth(column: MainColumnTitles) {
	return Math.max(getMainColumnMinWidth(column), getHeaderMinimumWidth(column));
}
