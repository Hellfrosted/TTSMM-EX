import {
	type DisplayModData,
	type MainCollectionConfig,
	MainColumnTitles,
	getMainColumnMinWidth,
	getModDataDisplayId,
	getModDataDisplayName
} from 'model';
import { getAllCollectionTags } from 'renderer/collection-tags';
import { APP_FONT_FAMILY } from 'renderer/theme';
import { formatDateStr } from 'util/Date';
import {
	getVirtualTableColumnPixelWidth,
	getVirtualTableColumnWidthStyle,
	getVirtualTableColumnWidthVariableName,
	getVirtualTableFixedColumnStyle,
	getVirtualTableScrollWidth,
	setVirtualTableColumnWidthVariable,
	type VirtualTableColumnWidthLike
} from 'renderer/virtual-table-geometry';

export const DEFAULT_SELECTION_COLUMN_WIDTH = 48;
export const COLUMN_MEASUREMENT_SAMPLE_SIZE = 120;
export const COLUMN_AUTO_MEASURE_MAX_ROWS = 120;
const COLUMN_MEASUREMENT_CACHE_LIMIT = 12;
const NAME_CELL_ICON_WIDTH = 18;

export const ALL_MAIN_COLUMN_TITLES = Object.values(MainColumnTitles) as MainColumnTitles[];
const mainColumnTitleSet = new Set<string>(ALL_MAIN_COLUMN_TITLES);
const columnMeasurementCache = new Map<string, Record<string, number>>();

const DEFAULT_MAIN_COLUMN_WIDTHS: Record<MainColumnTitles, number> = {
	[MainColumnTitles.TYPE]: 56,
	[MainColumnTitles.NAME]: 288,
	[MainColumnTitles.AUTHORS]: 88,
	[MainColumnTitles.STATE]: 64,
	[MainColumnTitles.ID]: 96,
	[MainColumnTitles.SIZE]: 64,
	[MainColumnTitles.LAST_UPDATE]: 104,
	[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 104,
	[MainColumnTitles.DATE_ADDED]: 104,
	[MainColumnTitles.TAGS]: 128
};

const RESPONSIVE_COLUMN_MIN_TABLE_WIDTHS: Partial<Record<MainColumnTitles, number>> = {
	[MainColumnTitles.AUTHORS]: 760,
	[MainColumnTitles.STATE]: 860,
	[MainColumnTitles.SIZE]: 960,
	[MainColumnTitles.LAST_UPDATE]: 1080,
	[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 1180,
	[MainColumnTitles.DATE_ADDED]: 1280,
	[MainColumnTitles.TAGS]: 1380
};

const MAIN_COLUMN_FILL_WEIGHTS: Partial<Record<MainColumnTitles, number>> = {
	[MainColumnTitles.TYPE]: 0.1,
	[MainColumnTitles.NAME]: 0.1,
	[MainColumnTitles.AUTHORS]: 0.25,
	[MainColumnTitles.STATE]: 0.25,
	[MainColumnTitles.ID]: 0.25,
	[MainColumnTitles.SIZE]: 0.5,
	[MainColumnTitles.LAST_UPDATE]: 0.5,
	[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 0.5,
	[MainColumnTitles.DATE_ADDED]: 0.5,
	[MainColumnTitles.TAGS]: 3
};

export const AUTO_MEASURE_MAIN_COLUMN_TITLES = new Set<MainColumnTitles>([
	MainColumnTitles.TYPE,
	MainColumnTitles.NAME,
	MainColumnTitles.AUTHORS,
	MainColumnTitles.STATE,
	MainColumnTitles.ID,
	MainColumnTitles.SIZE,
	MainColumnTitles.LAST_UPDATE,
	MainColumnTitles.LAST_WORKSHOP_UPDATE,
	MainColumnTitles.DATE_ADDED,
	MainColumnTitles.TAGS
]);

interface RenderedColumnBodyCell {
	cell: HTMLElement;
	row: DisplayModData;
}

export function isMainColumnTitle(value: string): value is MainColumnTitles {
	return mainColumnTitleSet.has(value);
}

export function getDefaultMainColumnWidth(columnTitle: MainColumnTitles) {
	return DEFAULT_MAIN_COLUMN_WIDTHS[columnTitle];
}

function getHeaderMinimumWidth(columnTitle: MainColumnTitles) {
	return Math.ceil(columnTitle.length * 8 + 34);
}

export function getResolvedMainColumnMinWidth(columnTitle: MainColumnTitles) {
	return Math.max(getMainColumnMinWidth(columnTitle), getHeaderMinimumWidth(columnTitle));
}

export function getActiveMainColumnTitles(config: MainCollectionConfig | undefined) {
	const configuredColumnSet = new Set<MainColumnTitles>();
	const configuredOrder = (config?.columnOrder || []).filter((column): column is MainColumnTitles => {
		if (!isMainColumnTitle(column) || configuredColumnSet.has(column)) {
			return false;
		}
		configuredColumnSet.add(column);
		return true;
	});
	const orderedColumns = [...configuredOrder, ...ALL_MAIN_COLUMN_TITLES.filter((column) => !configuredColumnSet.has(column))];
	const columnActiveConfig = config?.columnActiveConfig;
	if (!columnActiveConfig) {
		return orderedColumns;
	}

	return orderedColumns.filter((columnTitle) => columnActiveConfig[columnTitle] || columnActiveConfig[columnTitle] === undefined);
}

export function getResponsiveMainColumnTitles(config: MainCollectionConfig | undefined, availableTableWidth = 0) {
	const activeColumns = getActiveMainColumnTitles(config);
	if (availableTableWidth <= 0) {
		return activeColumns;
	}

	return activeColumns.filter((columnTitle) => {
		const minimumResponsiveWidth = RESPONSIVE_COLUMN_MIN_TABLE_WIDTHS[columnTitle];
		return minimumResponsiveWidth === undefined || availableTableWidth >= minimumResponsiveWidth;
	});
}

export function areColumnWidthMapsEqual(left: Record<string, number>, right: Record<string, number>) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every((key) => left[key] === right[key]);
}

export function getColumnMeasurementCacheKey(measurementInputKey: string, activeColumnTitles: string[]) {
	return `${measurementInputKey}::${activeColumnTitles.join('|')}`;
}

export function getCachedColumnMeasurements(cacheKey: string) {
	return columnMeasurementCache.get(cacheKey);
}

export function cacheColumnMeasurements(cacheKey: string, widths: Record<string, number>) {
	columnMeasurementCache.delete(cacheKey);
	columnMeasurementCache.set(cacheKey, widths);
	if (columnMeasurementCache.size <= COLUMN_MEASUREMENT_CACHE_LIMIT) {
		return;
	}

	const oldestCacheKey = columnMeasurementCache.keys().next().value;
	if (oldestCacheKey) {
		columnMeasurementCache.delete(oldestCacheKey);
	}
}

export function resetColumnMeasurementCache() {
	columnMeasurementCache.clear();
}

function parsePixelValue(value: string | null | undefined) {
	const parsed = Number.parseFloat(value || '');
	return Number.isFinite(parsed) ? parsed : 0;
}

function getHorizontalInsets(element: Element) {
	const style = window.getComputedStyle(element);
	return (
		parsePixelValue(style.paddingLeft) +
		parsePixelValue(style.paddingRight) +
		parsePixelValue(style.borderLeftWidth) +
		parsePixelValue(style.borderRightWidth)
	);
}

function getHorizontalPadding(element: Element) {
	const style = window.getComputedStyle(element);
	return parsePixelValue(style.paddingLeft) + parsePixelValue(style.paddingRight);
}

function getHorizontalMargins(element: Element) {
	const style = window.getComputedStyle(element);
	return parsePixelValue(style.marginLeft) + parsePixelValue(style.marginRight);
}

function buildFontShorthand(style: CSSStyleDeclaration) {
	if (style.font) {
		return style.font;
	}

	return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`
		.replace(/\s+/g, ' ')
		.trim();
}

function getElementFont(element: Element | null, fallbackFont: string) {
	if (!element) {
		return fallbackFont;
	}

	const font = buildFontShorthand(window.getComputedStyle(element));
	return font || fallbackFont;
}

function getFallbackTextWidth(text: string, font: string) {
	const fontSizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
	const fontSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[1]) : 14;
	return text.length * fontSize * 0.56;
}

let textMeasurementCanvas: HTMLCanvasElement | null = null;
let canUseCanvasTextMeasurement: boolean | null = null;

function measureTextWidth(text: string, font: string) {
	if (!text) {
		return 0;
	}

	if (canUseCanvasTextMeasurement === null) {
		canUseCanvasTextMeasurement = !window.navigator.userAgent.toLowerCase().includes('jsdom');
	}

	if (!canUseCanvasTextMeasurement) {
		return Math.ceil(getFallbackTextWidth(text, font));
	}

	if (!textMeasurementCanvas) {
		textMeasurementCanvas = document.createElement('canvas');
	}

	const context = textMeasurementCanvas.getContext('2d');
	if (!context) {
		return Math.ceil(getFallbackTextWidth(text, font));
	}

	context.font = font;
	return Math.ceil(context.measureText(text).width);
}

function getRenderedElementWidth(element: HTMLElement) {
	return Math.ceil(Math.max(element.getBoundingClientRect().width, element.scrollWidth, element.offsetWidth));
}

function getInlineChildrenWidth(container: HTMLElement) {
	const childElements = Array.from(container.children).filter((element): element is HTMLElement => element instanceof HTMLElement);
	if (childElements.length === 0) {
		return 0;
	}

	return childElements.reduce((totalWidth, childElement) => {
		return totalWidth + getRenderedElementWidth(childElement) + getHorizontalMargins(childElement);
	}, 0);
}

export function formatSizeLabel(size?: number) {
	if (!size || size <= 0) {
		return undefined;
	}

	const strNum = `${size}`;
	const power = strNum.length;
	const [digit1 = '', digit2 = '', digit3Raw = '', digit4] = strNum;
	let digit3 = digit3Raw;
	if (!digit4) {
		return `${strNum} B`;
	}

	digit3 = parseInt(digit4, 10) >= 5 ? `${parseInt(digit3, 10) + 1}` : digit3;

	let descriptor = ' B';
	if (power > 3) {
		if (power > 6) {
			descriptor = power > 9 ? ' GB' : ' MB';
		} else {
			descriptor = ' KB';
		}
	}

	let value = `${digit1}${digit2}${digit3}`;
	const decimal = power % 3;
	if (decimal === 1) {
		value = `${digit1}.${digit2}${digit3}`;
	} else if (decimal === 2) {
		value = `${digit1}${digit2}.${digit3}`;
	}

	return value + descriptor;
}

export function getAllTags(record: DisplayModData) {
	return getAllCollectionTags(record);
}

export function getMainCollectionAvailableTableWidth(tableRoot: HTMLElement, observedContentWidth?: number) {
	if (typeof observedContentWidth === 'number' && observedContentWidth > 0) {
		return Math.round(observedContentWidth);
	}

	return Math.max(0, Math.round(tableRoot.clientWidth - getHorizontalPadding(tableRoot)));
}

export function getRenderedColumnBodyCells(tableRoot: HTMLElement, activeColumnTitles: string[], sampledRows: DisplayModData[]) {
	const headerRow = tableRoot.querySelector<HTMLElement>('.MainCollectionVirtualTable thead tr:last-child');
	const headerCells = headerRow
		? Array.from(headerRow.children).filter((element): element is HTMLElement => element instanceof HTMLElement)
		: [];
	const body = tableRoot.querySelector<HTMLElement>('.MainCollectionVirtualTableBody');
	const bodyRows = body ? Array.from(body.children).filter((element): element is HTMLElement => element instanceof HTMLElement) : [];
	const sampledBodyRows = bodyRows.slice(0, sampledRows.length);
	const sampledBodyCells = sampledBodyRows.map((row) => Array.from(row.querySelectorAll<HTMLElement>('td')));
	const leadingCellCount = Math.max(0, headerCells.length - activeColumnTitles.length);

	return activeColumnTitles.reduce(
		(acc, columnTitle, columnIndex) => {
			const renderedColumnIndex = columnIndex + leadingCellCount;
			const renderedCells: RenderedColumnBodyCell[] = [];
			sampledBodyCells.forEach((bodyCells, rowIndex) => {
				const bodyCell = bodyCells[renderedColumnIndex];
				const row = sampledRows[rowIndex];
				if (bodyCell && row) {
					renderedCells.push({ cell: bodyCell, row });
				}
			});
			acc[columnTitle] = renderedCells;
			return acc;
		},
		{} as Record<string, RenderedColumnBodyCell[]>
	);
}

function measureInlineChildrenCellWidth(cell: HTMLElement) {
	return Math.ceil(getHorizontalInsets(cell) + getInlineChildrenWidth(cell));
}

function measureNameCellWidth(cell: HTMLElement, row: DisplayModData) {
	const button = cell.querySelector<HTMLElement>('.CollectionNameButton');
	const labelElement = cell.querySelector<HTMLElement>('.CollectionNameLabel');
	const displayName = getModDataDisplayName(row) || row.uid;
	const fallbackFont = `${row.needsUpdate ? 700 : 400} 14px ${APP_FONT_FAMILY}`;
	let width = getHorizontalInsets(cell);

	if (button) {
		width += getHorizontalInsets(button);
	}

	width += measureTextWidth(` ${displayName} `, getElementFont(labelElement || button, fallbackFont));
	if (row.needsUpdate) {
		width += NAME_CELL_ICON_WIDTH;
	}
	if (row.hasCode) {
		width += NAME_CELL_ICON_WIDTH;
	}

	return Math.ceil(width);
}

function measureIdCellWidth(cell: HTMLElement, row: DisplayModData) {
	const tag = cell.querySelector<HTMLElement>('.MainCollectionTag');
	if (tag) {
		return Math.ceil(getHorizontalInsets(cell) + getRenderedElementWidth(tag) + getHorizontalMargins(tag));
	}

	const displayId = getModDataDisplayId(row);
	if (!displayId) {
		return 0;
	}

	return Math.ceil(getHorizontalInsets(cell) + measureTextWidth(displayId, getElementFont(cell, `400 14px ${APP_FONT_FAMILY}`)));
}

export function measureBodyCellWidth(columnTitle: MainColumnTitles, renderedCell: RenderedColumnBodyCell) {
	const { cell, row } = renderedCell;
	switch (columnTitle) {
		case MainColumnTitles.NAME:
			return measureNameCellWidth(cell, row);
		case MainColumnTitles.AUTHORS:
		case MainColumnTitles.STATE:
		case MainColumnTitles.TAGS:
			return measureInlineChildrenCellWidth(cell);
		case MainColumnTitles.ID:
			return measureIdCellWidth(cell, row);
		case MainColumnTitles.SIZE:
			return cell.querySelector<HTMLElement>('.MainCollectionTag')
				? measureInlineChildrenCellWidth(cell)
				: Math.ceil(
						getHorizontalInsets(cell) +
							measureTextWidth(formatSizeLabel(row.size) || '', getElementFont(cell, `500 14px ${APP_FONT_FAMILY}`))
					);
		default:
			if (columnTitle === MainColumnTitles.TYPE) {
				return getMainColumnMinWidth(columnTitle);
			}
			if (
				columnTitle === MainColumnTitles.LAST_UPDATE ||
				columnTitle === MainColumnTitles.LAST_WORKSHOP_UPDATE ||
				columnTitle === MainColumnTitles.DATE_ADDED
			) {
				const value =
					row[
						columnTitle === MainColumnTitles.LAST_UPDATE
							? 'lastUpdate'
							: columnTitle === MainColumnTitles.LAST_WORKSHOP_UPDATE
								? 'lastWorkshopUpdate'
								: 'dateAdded'
					];
				return Math.ceil(
					getHorizontalInsets(cell) +
						measureTextWidth(value instanceof Date ? formatDateStr(value) : '', getElementFont(cell, `400 14px ${APP_FONT_FAMILY}`))
				);
			}
			return Math.ceil(
				getHorizontalInsets(cell) + measureTextWidth(String(cell.textContent || ''), getElementFont(cell, `400 14px ${APP_FONT_FAMILY}`))
			);
	}
}

export function getMeasurementRowSignature(rows: DisplayModData[]) {
	if (rows.length === 0) {
		return 'empty';
	}

	return rows
		.slice(0, COLUMN_MEASUREMENT_SAMPLE_SIZE)
		.map((row) => {
			return [
				row.uid,
				getModDataDisplayName(row) || '',
				getModDataDisplayId(row) || '',
				(row.authors || []).join(','),
				formatSizeLabel(row.size) || '',
				getAllTags(row)
					.sort((left, right) => left.localeCompare(right))
					.join(','),
				row.subscribed ? '1' : '0',
				row.installed ? '1' : '0',
				row.needsUpdate ? '1' : '0',
				row.downloadPending ? '1' : '0',
				row.downloading ? '1' : '0',
				row.hasCode ? '1' : '0',
				JSON.stringify(row.errors || {})
			].join('::');
		})
		.sort((left, right) => left.localeCompare(right))
		.join('|');
}

export function getColumnWidths(
	config: MainCollectionConfig | undefined,
	autoColumnWidths: Record<string, number> = {},
	availableTableWidth = 0
) {
	const configuredWidths = config?.columnWidthConfig || {};
	const columnWidths = getResponsiveMainColumnTitles(config, availableTableWidth).reduce<Record<string, number>>((acc, columnTitle) => {
		const minWidth = getResolvedMainColumnMinWidth(columnTitle);
		const configuredWidth = configuredWidths[columnTitle] ?? autoColumnWidths[columnTitle] ?? getDefaultMainColumnWidth(columnTitle);
		acc[columnTitle] = Math.max(minWidth, configuredWidth);
		return acc;
	}, {});

	const availableColumnWidth = Math.max(0, availableTableWidth - DEFAULT_SELECTION_COLUMN_WIDTH);
	const currentWidth = Object.values(columnWidths).reduce((totalWidth, width) => totalWidth + width, 0);
	const extraWidth = Math.max(0, availableColumnWidth - currentWidth);
	if (extraWidth > 0) {
		const activeFillColumns = Object.keys(columnWidths).filter((columnTitle): columnTitle is MainColumnTitles =>
			Object.prototype.hasOwnProperty.call(MAIN_COLUMN_FILL_WEIGHTS, columnTitle)
		);
		const fillColumns = activeFillColumns.length > 0 ? activeFillColumns : Object.keys(columnWidths);
		const totalWeight = fillColumns.reduce(
			(totalWeight, columnTitle) => totalWeight + (MAIN_COLUMN_FILL_WEIGHTS[columnTitle as MainColumnTitles] || 1),
			0
		);
		let remainingWidth = extraWidth;
		fillColumns.forEach((columnTitle, index) => {
			const widthShare =
				index === fillColumns.length - 1
					? remainingWidth
					: Math.floor((extraWidth * (MAIN_COLUMN_FILL_WEIGHTS[columnTitle as MainColumnTitles] || 1)) / totalWeight);
			columnWidths[columnTitle] += widthShare;
			remainingWidth -= widthShare;
		});
	}

	return columnWidths;
}

export function getColumnWidthVariableName(columnTitle: string) {
	return getVirtualTableColumnWidthVariableName('main-collection', columnTitle);
}

export function getColumnWidthStyle(columnTitle: string, width: number) {
	return getVirtualTableColumnWidthStyle('main-collection', columnTitle, width);
}

export function getMainCollectionVirtualColumnStyle(width: number | string) {
	return getVirtualTableFixedColumnStyle(width);
}

export function setColumnWidthVariable(container: HTMLElement | null, columnTitle: string, width: number) {
	setVirtualTableColumnWidthVariable(container, 'main-collection', columnTitle, width);
}

export function getColumnPixelWidth(column: VirtualTableColumnWidthLike) {
	return getVirtualTableColumnPixelWidth(column);
}

export function getMainCollectionTableScrollWidth(columnWidths: Record<string, number>) {
	return getVirtualTableScrollWidth(Object.values(columnWidths), DEFAULT_SELECTION_COLUMN_WIDTH);
}
