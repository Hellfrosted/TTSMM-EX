export interface VirtualTableColumnWidthLike {
	resizeWidth?: number;
	width?: number | string;
}

export const VIRTUAL_TABLE_OVERSCAN = 8;
export const MAIN_COLLECTION_VIRTUAL_ROW_HEIGHT = 48;
export const BLOCK_LOOKUP_VIRTUAL_ROW_HEIGHT = 44;
export const COMPACT_VIRTUAL_ROW_HEIGHT = 34;

interface VirtualTableRowHeightOptions {
	compact?: boolean;
	coarsePointer?: boolean;
	regularHeight: number;
}

function normalizeVirtualTablePixelWidth(width: number, fallbackWidth = 0) {
	const resolvedWidth = Number.isFinite(width) ? width : fallbackWidth;
	return Math.max(0, Math.round(resolvedWidth));
}

function getVirtualTableColumnToken(columnKey: string) {
	const token = columnKey
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return token || 'column';
}

export function getVirtualTableColumnWidthVariableName(prefix: string, columnKey: string) {
	return `--${prefix}-column-width-${getVirtualTableColumnToken(columnKey)}`;
}

export function getVirtualTableColumnWidthStyle(prefix: string, columnKey: string, width: number) {
	return `var(${getVirtualTableColumnWidthVariableName(prefix, columnKey)}, ${normalizeVirtualTablePixelWidth(width)}px)`;
}

export function setVirtualTableColumnWidthVariable(container: HTMLElement | null, prefix: string, columnKey: string, width: number) {
	container?.style.setProperty(getVirtualTableColumnWidthVariableName(prefix, columnKey), `${normalizeVirtualTablePixelWidth(width)}px`);
}

export function getVirtualTableFixedColumnStyle(width: number | string) {
	const resolvedWidth = typeof width === 'number' ? normalizeVirtualTablePixelWidth(width) : width;
	const flexBasis = typeof resolvedWidth === 'number' ? `${resolvedWidth}px` : resolvedWidth;
	return {
		width: resolvedWidth,
		flex: `0 0 ${flexBasis}`
	};
}

export function getVirtualTableColumnPixelWidth(column: VirtualTableColumnWidthLike, fallbackWidth = 120) {
	if (typeof column.resizeWidth === 'number' && Number.isFinite(column.resizeWidth)) {
		return normalizeVirtualTablePixelWidth(column.resizeWidth, fallbackWidth);
	}

	if (typeof column.width === 'number' && Number.isFinite(column.width)) {
		return normalizeVirtualTablePixelWidth(column.width, fallbackWidth);
	}

	if (typeof column.width === 'string') {
		const match = /(\d+(?:\.\d+)?)px/.exec(column.width);
		if (match) {
			return normalizeVirtualTablePixelWidth(Number.parseFloat(match[1]), fallbackWidth);
		}
	}

	return normalizeVirtualTablePixelWidth(fallbackWidth);
}

export function getVirtualTableScrollWidth(columnWidths: Iterable<number>, fixedWidth = 0) {
	let scrollWidth = normalizeVirtualTablePixelWidth(fixedWidth);
	for (const columnWidth of columnWidths) {
		scrollWidth += normalizeVirtualTablePixelWidth(columnWidth);
	}
	return scrollWidth;
}

export function getVirtualTableRowHeight({ compact, coarsePointer, regularHeight }: VirtualTableRowHeightOptions) {
	return compact && !coarsePointer ? COMPACT_VIRTUAL_ROW_HEIGHT : regularHeight;
}
