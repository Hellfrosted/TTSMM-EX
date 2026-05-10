export interface VirtualTableColumnWidthLike {
	resizeWidth?: number;
	width?: number | string;
}

export function getVirtualTableColumnWidthVariableName(prefix: string, columnKey: string) {
	return `--${prefix}-column-width-${columnKey
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}`;
}

export function getVirtualTableColumnWidthStyle(prefix: string, columnKey: string, width: number) {
	return `var(${getVirtualTableColumnWidthVariableName(prefix, columnKey)}, ${width}px)`;
}

export function setVirtualTableColumnWidthVariable(container: HTMLElement | null, prefix: string, columnKey: string, width: number) {
	container?.style.setProperty(getVirtualTableColumnWidthVariableName(prefix, columnKey), `${width}px`);
}

export function getVirtualTableFixedColumnStyle(width: number | string) {
	const flexBasis = typeof width === 'number' ? `${width}px` : width;
	return {
		width,
		flex: `0 0 ${flexBasis}`
	};
}

export function getVirtualTableColumnPixelWidth(column: VirtualTableColumnWidthLike, fallbackWidth = 120) {
	if (typeof column.resizeWidth === 'number') {
		return column.resizeWidth;
	}

	if (typeof column.width === 'number') {
		return column.width;
	}

	if (typeof column.width === 'string') {
		const match = /(\d+(?:\.\d+)?)px/.exec(column.width);
		if (match) {
			return Number.parseFloat(match[1]);
		}
	}

	return fallbackWidth;
}

export function getVirtualTableScrollWidth(columnWidths: Iterable<number>, fixedWidth = 0) {
	let scrollWidth = fixedWidth;
	for (const columnWidth of columnWidths) {
		scrollWidth += columnWidth;
	}
	return scrollWidth;
}
