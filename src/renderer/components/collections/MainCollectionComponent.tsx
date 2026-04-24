import { Dropdown, Layout, Table, Tag, Tooltip, Typography } from 'antd';
import { useOutletContext } from 'react-router-dom';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ThHTMLAttributes } from 'react';
import type { MenuProps } from 'antd';
import { ColumnType } from 'antd/lib/table';
import { SortOrder, TableRowSelection } from 'antd/lib/table/interface';
import api from 'renderer/Api';
import { APP_FONT_FAMILY, APP_TAG_STYLES, APP_THEME_COLORS } from 'renderer/theme';
import {
	CollectionViewProps,
	DisplayModData,
	MainCollectionConfig,
	MainColumnTitles,
	ModErrors,
	ModType,
	getMainColumnMinWidth,
	getModDataDisplayName,
	compareModDataDisplayName,
	getModDataDisplayId,
	compareModDataDisplayId,
	CorpType,
	getCorpType
} from 'model';
import ClockCircleTwoTone from '@ant-design/icons/es/icons/ClockCircleTwoTone';
import CodeFilled from '@ant-design/icons/es/icons/CodeFilled';
import HddFilled from '@ant-design/icons/es/icons/HddFilled';
import StopTwoTone from '@ant-design/icons/es/icons/StopTwoTone';
import WarningTwoTone from '@ant-design/icons/es/icons/WarningTwoTone';
import { formatDateStr } from 'util/Date';

import steam from '../../../../assets/steam.png';
import ttmm from '../../../../assets/ttmm.png';
import Corp_Icon_HE from '../../../../assets/Corp_Icon_HE.png';
import Corp_Icon_BF from '../../../../assets/Corp_Icon_BF.png';
import Corp_Icon_GC from '../../../../assets/Corp_Icon_GC.png';
import Corp_Icon_GSO from '../../../../assets/Corp_Icon_GSO.png';
import Corp_Icon_VEN from '../../../../assets/Corp_Icon_VEN.png';
import Corp_Icon_RR from '../../../../assets/Corp_Icon_EXP.png';
import Corp_Icon_SPE from '../../../../assets/Corp_Icon_SPE.png';
import Icon_Skins from '../../../../assets/paintbrush.svg';
import Icon_Blocks from '../../../../assets/StandardBlocks.svg';
import Icon_Corps from '../../../../assets/faction-flag.svg';

const { Content } = Layout;
const { Text } = Typography;
const DEFAULT_SELECTION_COLUMN_WIDTH = 48;
const KEYBOARD_RESIZE_STEP = 16;
const COLUMN_MEASUREMENT_SAMPLE_SIZE = 24;
const COLUMN_AUTO_MEASURE_MAX_ROWS = 120;
const COLUMN_MEASUREMENT_CACHE_LIMIT = 12;
const NAME_CELL_ICON_WIDTH = 18;
const SIZE_COLOR_MIN_BYTES = 10 * 1024;
const SIZE_COLOR_MAX_BYTES = 100 * 1024 * 1024;
const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;
const TABLE_SORT_DIRECTIONS: SortOrder[] = ['ascend', 'descend', 'ascend'];
const ALL_MAIN_COLUMN_TITLES = Object.values(MainColumnTitles) as MainColumnTitles[];
const columnMeasurementCache = new Map<string, Record<string, number>>();
const AUTO_MEASURE_COLUMN_TITLES = new Set<MainColumnTitles>([
	MainColumnTitles.NAME,
	MainColumnTitles.AUTHORS,
	MainColumnTitles.STATE,
	MainColumnTitles.ID,
	MainColumnTitles.SIZE,
	MainColumnTitles.TAGS
]);
interface SizeColorBand {
	upperBound: number;
	startColor: string;
	endColor: string;
	backgroundStartMix: number;
	borderMix: number;
	textMix: number;
}

const SIZE_COLOR_BANDS: readonly SizeColorBand[] = [
	{
		upperBound: 128 * KILOBYTE,
		startColor: APP_THEME_COLORS.success,
		endColor: blendHexColors(APP_THEME_COLORS.success, APP_THEME_COLORS.warning, 0.18),
		backgroundStartMix: 0.22,
		borderMix: 0.5,
		textMix: 0.12
	},
	{
		upperBound: 512 * KILOBYTE,
		startColor: blendHexColors(APP_THEME_COLORS.success, APP_THEME_COLORS.primary, 0.34),
		endColor: blendHexColors(APP_THEME_COLORS.success, APP_THEME_COLORS.warning, 0.44),
		backgroundStartMix: 0.24,
		borderMix: 0.54,
		textMix: 0.14
	},
	{
		upperBound: 2 * MEGABYTE,
		startColor: APP_THEME_COLORS.primary,
		endColor: blendHexColors(APP_THEME_COLORS.primary, APP_THEME_COLORS.warning, 0.16),
		backgroundStartMix: 0.26,
		borderMix: 0.58,
		textMix: 0.16
	},
	{
		upperBound: 8 * MEGABYTE,
		startColor: blendHexColors(APP_THEME_COLORS.primary, APP_THEME_COLORS.warning, 0.26),
		endColor: blendHexColors(APP_THEME_COLORS.primary, APP_THEME_COLORS.warning, 0.48),
		backgroundStartMix: 0.29,
		borderMix: 0.62,
		textMix: 0.18
	},
	{
		upperBound: 24 * MEGABYTE,
		startColor: APP_THEME_COLORS.warning,
		endColor: blendHexColors(APP_THEME_COLORS.warning, APP_THEME_COLORS.error, 0.16),
		backgroundStartMix: 0.32,
		borderMix: 0.67,
		textMix: 0.2
	},
	{
		upperBound: 64 * MEGABYTE,
		startColor: blendHexColors(APP_THEME_COLORS.warning, APP_THEME_COLORS.error, 0.32),
		endColor: blendHexColors(APP_THEME_COLORS.warning, APP_THEME_COLORS.error, 0.58),
		backgroundStartMix: 0.36,
		borderMix: 0.72,
		textMix: 0.24
	},
	{
		upperBound: Number.POSITIVE_INFINITY,
		startColor: blendHexColors(APP_THEME_COLORS.warning, APP_THEME_COLORS.error, 0.7),
		endColor: APP_THEME_COLORS.error,
		backgroundStartMix: 0.42,
		borderMix: 0.78,
		textMix: 0.28
	}
] as const;
const RESPONSIVE_COLUMN_MIN_TABLE_WIDTHS: Partial<Record<MainColumnTitles, number>> = {
	[MainColumnTitles.AUTHORS]: 760,
	[MainColumnTitles.STATE]: 860,
	[MainColumnTitles.SIZE]: 960,
	[MainColumnTitles.LAST_UPDATE]: 1080,
	[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 1180,
	[MainColumnTitles.DATE_ADDED]: 1280,
	[MainColumnTitles.TAGS]: 1380
};

function areColumnWidthMapsEqual(left: Record<string, number>, right: Record<string, number>) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every((key) => left[key] === right[key]);
}

function getColumnMeasurementCacheKey(measurementInputKey: string, activeColumnTitles: string[]) {
	return `${measurementInputKey}::${activeColumnTitles.join('|')}`;
}

function cacheColumnMeasurements(cacheKey: string, widths: Record<string, number>) {
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

function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function parseRgbColor(color: string): [number, number, number] {
	const normalized = color.trim();
	if (normalized.startsWith('#')) {
		const hexValue = normalized.slice(1);
		const expanded = hexValue.length === 3 ? hexValue.split('').map((value) => `${value}${value}`).join('') : hexValue;
		return [
			Number.parseInt(expanded.slice(0, 2), 16),
			Number.parseInt(expanded.slice(2, 4), 16),
			Number.parseInt(expanded.slice(4, 6), 16)
		];
	}

	const rgbMatch = normalized.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
	if (rgbMatch) {
		return [Number.parseFloat(rgbMatch[1]), Number.parseFloat(rgbMatch[2]), Number.parseFloat(rgbMatch[3])].map((channel) =>
			Math.round(channel)
		) as [number, number, number];
	}

	throw new Error(`Unsupported color format: ${color}`);
}

function mixRgbChannels(left: [number, number, number], right: [number, number, number], amount: number): [number, number, number] {
	return left.map((channel, index) => {
		return Math.round(channel + (right[index] - channel) * amount);
	}) as [number, number, number];
}

function rgbString([red, green, blue]: [number, number, number]) {
	return `rgb(${red}, ${green}, ${blue})`;
}

function blendHexColors(left: string, right: string, amount: number) {
	return rgbString(mixRgbChannels(parseRgbColor(left), parseRgbColor(right), amount));
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

function getSizeColorBandIndex(size: number) {
	const normalizedSize = Math.max(size, SIZE_COLOR_MIN_BYTES);
	return SIZE_COLOR_BANDS.findIndex((band) => normalizedSize <= band.upperBound);
}

function getSizeBandProgress(size: number, bandIndex: number) {
	const lowerBound = bandIndex === 0 ? SIZE_COLOR_MIN_BYTES : SIZE_COLOR_BANDS[bandIndex - 1].upperBound;
	const upperBound = Number.isFinite(SIZE_COLOR_BANDS[bandIndex].upperBound) ? SIZE_COLOR_BANDS[bandIndex].upperBound : SIZE_COLOR_MAX_BYTES;
	const clampedSize = clampNumber(size, lowerBound, upperBound);
	return (Math.log(clampedSize) - Math.log(lowerBound)) / (Math.log(upperBound) - Math.log(lowerBound) || 1);
}

function getSizeTagStyle(size: number): CSSProperties {
	const bandIndex = getSizeColorBandIndex(size);
	const band = SIZE_COLOR_BANDS[bandIndex];
	const bandProgress = clampNumber(getSizeBandProgress(size, bandIndex), 0, 1);
	const baseColor = parseRgbColor(blendHexColors(band.startColor, band.endColor, bandProgress));
	const surfaceColor = parseRgbColor(APP_THEME_COLORS.surfaceElevated);
	const textColor = parseRgbColor(APP_THEME_COLORS.textBase);
	const backgroundColor = mixRgbChannels(surfaceColor, baseColor, band.backgroundStartMix + bandProgress * 0.04);

	return {
		color: rgbString(mixRgbChannels(textColor, baseColor, band.textMix + bandProgress * 0.05)),
		background: rgbString(backgroundColor),
		borderColor: rgbString(mixRgbChannels(surfaceColor, baseColor, band.borderMix + bandProgress * 0.04))
	};
}

function getModTypeLabel(type: ModType) {
	switch (type) {
		case ModType.LOCAL:
			return 'Local mod';
		case ModType.TTQMM:
			return 'TTMM mod';
		case ModType.WORKSHOP:
			return 'Steam Workshop mod';
		default:
			return 'Mod';
	}
}

function getImageSrcFromType(type: ModType, size = 15) {
	const label = getModTypeLabel(type);
	switch (type) {
		case ModType.LOCAL:
			return (
				<Tooltip title={label}>
					<span role="img" aria-label={label}>
						<HddFilled style={{ fontSize: size }} />
					</span>
				</Tooltip>
			);
		case ModType.TTQMM:
			return (
				<Tooltip title={label}>
					<img src={ttmm} width={size} alt={label} key="type" />
				</Tooltip>
			);
		case ModType.WORKSHOP:
			return (
				<Tooltip title={label}>
					<img src={steam} width={size} alt={label} key="type" />
				</Tooltip>
			);
		default:
			return null;
	}
}

enum TypeTag {
	CORPS = 0,
	SKINS = 1,
	BLOCKS = 2
}

function getTypeIcon(type: TypeTag, size = 15) {
	const label =
		type === TypeTag.SKINS ? 'Skins' : type === TypeTag.BLOCKS ? 'Blocks' : type === TypeTag.CORPS ? 'Custom corps' : 'Tag';
	switch (type) {
		case TypeTag.SKINS:
			return (
				<Tooltip title={label} key={type}>
					<img src={Icon_Skins} width={size - 14} alt={label} key={type} />
				</Tooltip>
			);
		case TypeTag.BLOCKS:
			return (
				<Tooltip title={label} key={type}>
					<img src={Icon_Blocks} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case TypeTag.CORPS:
			return (
				<Tooltip title={label} key={type}>
					<img src={Icon_Corps} width={size - 10} alt={label} key={type} />
				</Tooltip>
			);
		default:
			return null;
	}
}

function getCorpIcon(type: CorpType, size = 15) {
	const label =
		type === CorpType.HE
			? 'Hawkeye (HE)'
			: type === CorpType.GSO
				? 'Galactic Survey Organization (GSO)'
				: type === CorpType.GC
					? 'GeoCorp (GC)'
					: type === CorpType.BF
						? 'Better Future (BF)'
						: type === CorpType.RR
							? 'Reticule Research (EXP)'
							: type === CorpType.SPE
								? 'Special (SPE)'
								: type === CorpType.VEN
									? 'Venture (VEN)'
									: 'Corporation';
	switch (type) {
		case CorpType.HE:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_HE} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case CorpType.GSO:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_GSO} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case CorpType.GC:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_GC} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case CorpType.BF:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_BF} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case CorpType.RR:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_RR} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case CorpType.SPE:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_SPE} width={size} alt={label} key={type} />
				</Tooltip>
			);
		case CorpType.VEN:
			return (
				<Tooltip title={label} key={type}>
					<img src={Corp_Icon_VEN} width={size} alt={label} key={type} />
				</Tooltip>
			);
		default:
			return null;
	}
}

function getTypeTag(tag: string): TypeTag | null {
	const lowercase = tag.toLowerCase().trim();
	if (lowercase === 'blocks') {
		return TypeTag.BLOCKS;
	}
	if (lowercase === 'skins') {
		return TypeTag.SKINS;
	}
	if (lowercase === 'custom corps') {
		return TypeTag.CORPS;
	}
	return null;
}

interface ColumnSchema {
	title: string;
	dataIndex: string;
	className?: string;
	width?: number;
	align?: 'center';
	defaultSortOrder?: 'ascend';
	filters?: ColumnType<DisplayModData>['filters'];
	filtersSetup?: (props: MainCollectionSchemaProps) => ColumnType<DisplayModData>['filters'];
	onFilter?: ColumnType<DisplayModData>['onFilter'];
	sorter?: ColumnType<DisplayModData>['sorter'];
	sorterSetup?: (props: MainCollectionSchemaProps) => ColumnType<DisplayModData>['sorter'];
	renderSetup?: (props: MainCollectionSchemaProps) => ColumnType<DisplayModData>['render'];
}

type MainCollectionSchemaProps = Pick<CollectionViewProps, 'collection' | 'config' | 'getModDetails' | 'lastValidationStatus' | 'rows'>;

interface StateTagConfig {
	tone?: keyof typeof APP_TAG_STYLES;
	rank: number;
	text: string;
}

function compareOptionalDates(a?: Date, b?: Date) {
	const left = a ? a.getTime() : 0;
	const right = b ? b.getTime() : 0;
	return left - right;
}

function getAllTags(record: DisplayModData) {
	return [...new Set([...(record.tags || []), ...(record.overrides?.tags || [])])].filter((tag) => tag.toLowerCase() !== 'mods');
}

interface ResizableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
	'data-column-title'?: string;
	headerMenu?: MenuProps;
	label?: string;
	width?: number | string;
	resizeWidth?: number;
	minWidth?: number;
	onResize?: (nextWidth: number) => void;
	onResizeEnd?: (nextWidth: number) => void;
}

function ResizableHeaderCell({
	headerMenu,
	label,
	width,
	resizeWidth,
	minWidth = 80,
	onResize,
	onResizeEnd,
	children,
	style,
	...rest
}: ResizableHeaderCellProps) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const currentResizeWidth = resizeWidth ?? (typeof width === 'number' ? width : minWidth);
	const resizeHandleRef = useRef<HTMLButtonElement | null>(null);
	const widthRef = useRef(currentResizeWidth);
	const resizeLabel = label ?? (typeof rest['data-column-title'] === 'string' ? rest['data-column-title'] : 'column');
	const syncResizeHandleValue = useCallback(
		(nextWidth: number) => {
			widthRef.current = nextWidth;
			const resizeHandle = resizeHandleRef.current;
			if (!resizeHandle) {
				return;
			}

			resizeHandle.setAttribute('aria-valuenow', `${nextWidth}`);
			resizeHandle.setAttribute('aria-valuetext', `${nextWidth}px wide`);
			resizeHandle.setAttribute('aria-valuemax', `${Math.max(minWidth, nextWidth + 1024)}`);
		},
		[minWidth]
	);

	useEffect(() => {
		syncResizeHandleValue(currentResizeWidth);
	}, [currentResizeWidth, syncResizeHandleValue]);

	useEffect(() => {
		return () => {
			cleanupRef.current?.();
		};
	}, []);

	const startResize = useCallback(
		(startX: number) => {
			const startWidth = Math.max(minWidth, widthRef.current || minWidth);
			let nextWidth = startWidth;
			const previousCursor = document.body.style.cursor;
			const previousUserSelect = document.body.style.userSelect;

			const updateWidth = (clientX: number) => {
				nextWidth = Math.max(minWidth, Math.round(startWidth + clientX - startX));
				syncResizeHandleValue(nextWidth);
				onResize?.(nextWidth);
			};

			const stopResize = () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				document.body.style.cursor = previousCursor;
				document.body.style.userSelect = previousUserSelect;
				cleanupRef.current = null;
				onResizeEnd?.(nextWidth);
			};

			const handleMouseMove = (event: MouseEvent) => {
				updateWidth(event.clientX);
			};

			const handleMouseUp = () => {
				stopResize();
			};

			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			cleanupRef.current = stopResize;
		},
		[minWidth, onResize, onResizeEnd, syncResizeHandleValue]
	);

	const handleMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			startResize(event.clientX);
		},
		[startResize]
	);

	const handleKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>) => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const nextWidth = Math.max(minWidth, Math.round((widthRef.current || minWidth) + direction * KEYBOARD_RESIZE_STEP));
			syncResizeHandleValue(nextWidth);
			onResize?.(nextWidth);
			onResizeEnd?.(nextWidth);
		},
		[minWidth, onResize, onResizeEnd, syncResizeHandleValue]
	);

	const headerContent = <div className="CollectionTableHeaderCell">{children}</div>;

	return (
		<th {...rest} style={{ ...(style || {}), width, position: 'relative' }}>
			<div className="CollectionTableHeaderInner">
				{headerMenu ? (
					<Dropdown menu={headerMenu} trigger={['contextMenu']}>
						<div className="CollectionTableHeaderContextTarget">{headerContent}</div>
					</Dropdown>
				) : (
					headerContent
				)}
			</div>
			{width ? (
				<button
					type="button"
					ref={resizeHandleRef}
					className="CollectionTableResizeHandle"
					role="slider"
					aria-label={`Resize ${resizeLabel}`}
					aria-orientation="horizontal"
					aria-valuemin={minWidth}
					aria-valuenow={currentResizeWidth}
					aria-valuemax={Math.max(minWidth, currentResizeWidth + 1024)}
					aria-valuetext={`${currentResizeWidth}px wide`}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onMouseDown={handleMouseDown}
					onKeyDown={handleKeyDown}
				/>
			) : null}
		</th>
	);
}

function canSetMainColumnVisibility(columnTitle: MainColumnTitles, visible: boolean, columnActiveConfig?: Record<string, boolean>) {
	if (visible) {
		return true;
	}

	if (columnTitle === MainColumnTitles.ID && columnActiveConfig?.[MainColumnTitles.NAME] === false) {
		return false;
	}

	if (columnTitle === MainColumnTitles.NAME && columnActiveConfig?.[MainColumnTitles.ID] === false) {
		return false;
	}

	return true;
}

function getStateTags(props: Pick<MainCollectionSchemaProps, 'collection' | 'lastValidationStatus'>, record: DisplayModData): StateTagConfig[] {
	const { lastValidationStatus, collection } = props;
	const selectedMods = collection.mods;
	const { uid, subscribed, workshopID, installed, id } = record;

	if (installed && id === null) {
		return [{ text: 'Invalid', tone: 'danger', rank: 0 }];
	}

	if (!selectedMods.includes(uid)) {
		if (!subscribed && workshopID && workshopID > 0) {
			return [{ text: 'Not subscribed', tone: 'warning', rank: 4 }];
		}
		if (subscribed && !installed) {
			return [{ text: 'Not installed', tone: 'warning', rank: 5 }];
		}
		return [];
	}

	const stateTags: StateTagConfig[] = [];
	const { errors } = record;
	if (errors) {
		const { incompatibleMods, invalidId, missingDependencies, notInstalled, notSubscribed, needsUpdate } = errors;
		if (incompatibleMods && incompatibleMods.length > 0) {
			stateTags.push({ text: 'Conflicts', tone: 'danger', rank: 1 });
		}
		if (invalidId) {
			stateTags.push({ text: 'Invalid ID', tone: 'danger', rank: 0 });
		}
		if (missingDependencies && missingDependencies.length > 0) {
			stateTags.push({ text: 'Missing dependencies', tone: 'warning', rank: 2 });
		}
		if (notSubscribed) {
			stateTags.push({ text: 'Not subscribed', tone: 'warning', rank: 4 });
		} else if (notInstalled) {
			stateTags.push({ text: 'Not installed', tone: 'warning', rank: 5 });
		} else if (needsUpdate) {
			stateTags.push({ text: 'Needs update', tone: 'warning', rank: 6 });
		}
	}

	if (stateTags.length > 0) {
		return stateTags;
	}

	if (lastValidationStatus !== undefined) {
		return [{ text: 'OK', tone: 'success', rank: 7 }];
	}

	if (selectedMods.includes(uid)) {
		return [{ text: 'Pending', tone: 'neutral', rank: 8 }];
	}

	return [];
}

function compareStateTags(leftTags: StateTagConfig[], rightTags: StateTagConfig[]) {
	const leftRank = leftTags.length > 0 ? Math.min(...leftTags.map((tag) => tag.rank)) : Number.MAX_SAFE_INTEGER;
	const rightRank = rightTags.length > 0 ? Math.min(...rightTags.map((tag) => tag.rank)) : Number.MAX_SAFE_INTEGER;
	if (leftRank !== rightRank) {
		return leftRank - rightRank;
	}

	const leftLabel = leftTags.map((tag) => tag.text).join(', ');
	const rightLabel = rightTags.map((tag) => tag.text).join(', ');
	return leftLabel.localeCompare(rightLabel);
}

function formatSizeLabel(size?: number) {
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

interface RenderedColumnBodyCell {
	cell: HTMLElement;
	row: DisplayModData;
}

function getRenderedColumnBodyCells(tableRoot: HTMLElement, activeColumnTitles: string[], sampledRows: DisplayModData[]) {
	const headerRow = tableRoot.querySelector<HTMLElement>('.ant-table-header thead tr:last-child');
	const headerCells = headerRow ? Array.from(headerRow.children).filter((element): element is HTMLElement => element instanceof HTMLElement) : [];
	const body = tableRoot.querySelector<HTMLElement>('.ant-table-tbody');
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
	const labelElement = cell.querySelector<HTMLElement>('.ant-typography');
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
	const tag = cell.querySelector<HTMLElement>('.ant-tag');
	if (tag) {
		return Math.ceil(getHorizontalInsets(cell) + getRenderedElementWidth(tag) + getHorizontalMargins(tag));
	}

	const displayId = getModDataDisplayId(row);
	if (!displayId) {
		return 0;
	}

	return Math.ceil(getHorizontalInsets(cell) + measureTextWidth(displayId, getElementFont(cell, `400 14px ${APP_FONT_FAMILY}`)));
}

function measureBodyCellWidth(columnTitle: MainColumnTitles, renderedCell: RenderedColumnBodyCell) {
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
			return cell.querySelector<HTMLElement>('.ant-tag')
				? measureInlineChildrenCellWidth(cell)
				: Math.ceil(
						getHorizontalInsets(cell) +
							measureTextWidth(formatSizeLabel(row.size) || '', getElementFont(cell, `500 14px ${APP_FONT_FAMILY}`))
				  );
		default:
			if (columnTitle === MainColumnTitles.TYPE) {
				return getMainColumnMinWidth(columnTitle);
			}
			return 0;
	}
}

function getMeasurementRowSignature(rows: DisplayModData[]) {
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
				getAllTags(row).sort((left, right) => left.localeCompare(right)).join(','),
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

const MAIN_COLUMN_SCHEMA: ColumnSchema[] = [
	{
		title: MainColumnTitles.TYPE,
		dataIndex: 'type',
		className: 'CollectionRowModType',
		renderSetup: (props: MainCollectionSchemaProps) => {
			const { config } = props;
			const small = (config as MainCollectionConfig | undefined)?.smallRows;
			return (type: ModType) => <span className="CollectionTypeIndicator">{getImageSrcFromType(type, small ? 22 : 30)}</span>;
		},
		width: 56,
		align: 'center'
	},
	{
		title: MainColumnTitles.NAME,
		dataIndex: 'name',
		className: 'CollectionRowModName',
		width: 288,
		defaultSortOrder: 'ascend',
		sorter: compareModDataDisplayName,
		renderSetup: (props: MainCollectionSchemaProps) => {
			const small = (props.config as MainCollectionConfig | undefined)?.smallRows;
			return (_name: string, record: DisplayModData) => {
				let updateIcon = null;
				let updateType: 'danger' | 'warning' | undefined;
				const { needsUpdate, downloadPending, downloading, uid, hasCode } = record;
				if (needsUpdate) {
					updateIcon = (
						<Tooltip title="Needs update">
							<WarningTwoTone twoToneColor={APP_THEME_COLORS.error} />
						</Tooltip>
					);
					updateType = 'danger';
					if (downloadPending) {
						updateIcon = (
							<Tooltip title="Download pending">
								<ClockCircleTwoTone twoToneColor={APP_THEME_COLORS.warning} />
							</Tooltip>
						);
						updateType = 'warning';
					}
					if (downloading) {
						updateIcon = (
							<Tooltip title="Downloading">
								<StopTwoTone spin twoToneColor={APP_THEME_COLORS.warning} />
							</Tooltip>
						);
						updateType = 'warning';
					}
				}
				const displayName = getModDataDisplayName(record) || record.uid;
				return (
					<button
						type="button"
						className="CollectionNameButton"
						aria-label={`Open details for ${displayName}`}
						style={{
							fontSize: small ? 13.5 : 14,
							backgroundColor: 'transparent',
							borderRadius: 0,
							width: '100%',
							padding: 2,
							paddingLeft: small ? 6 : 6,
							paddingRight: small ? 3 : 4,
							margin: 0,
							verticalAlign: 'middle',
							textAlign: 'left',
							wordWrap: 'break-word',
							display: 'block'
						}}
						onClick={() => {
							props.getModDetails(uid, record);
						}}
						>
							{updateIcon}
						<Text strong={needsUpdate} type={updateType} style={{ whiteSpace: 'normal', width: '100%', verticalAlign: 'middle' }}>{` ${displayName} `}</Text>
						{hasCode ? (
							<Tooltip title="Contains code">
								<CodeFilled style={{ color: APP_THEME_COLORS.success, fontSize: small ? 16 : 16, verticalAlign: 'middle' }} />
							</Tooltip>
						) : null}
					</button>
				);
			};
		}
	},
	{
		title: MainColumnTitles.AUTHORS,
		dataIndex: 'authors',
		width: 120,
		sorter: (a, b) => {
			const v1 = a;
			const v2 = b;
			if (v1.authors) {
				if (v2.authors) {
					const l1 = v1.authors.length;
					const l2 = v2.authors.length;
					let ind = 0;
					while (ind < l1 && ind < l2) {
						if (v1.authors[ind] > v2.authors[ind]) {
							return 1;
						}
						if (v1.authors[ind] < v2.authors[ind]) {
							return -1;
						}
						ind += 1;
					}
					if (l1 > l2) {
						return 1;
					}
					if (l1 < l2) {
						return -1;
					}
					return 0;
				}
				return 1;
			}
			return -1;
		},
		renderSetup: () => {
			return (authors: string[] | undefined) => {
				return (authors || []).map((author) => <Tag key={author}>{author}</Tag>);
			};
		}
	},
	{
		title: MainColumnTitles.STATE,
		dataIndex: 'errors',
		width: 112,
		sorterSetup: (props: MainCollectionSchemaProps) => {
			return (a: DisplayModData, b: DisplayModData) => compareStateTags(getStateTags(props, a), getStateTags(props, b));
		},
		renderSetup: (props: MainCollectionSchemaProps) => {
			return (_errors: ModErrors | undefined, record: DisplayModData) => {
				const stateTags = getStateTags(props, record);
				if (stateTags.length > 0) {
					return stateTags.map((tagConfig) => (
						<Tag key={tagConfig.text} style={APP_TAG_STYLES[tagConfig.tone || 'neutral']}>
							{tagConfig.text}
						</Tag>
					));
				}
				return null;
			};
		}
	},
	{
		title: MainColumnTitles.ID,
		dataIndex: 'id',
		width: 132,
		sorter: compareModDataDisplayId,
		renderSetup: () => {
			return (_: string, record: DisplayModData) => {
				const displayID = getModDataDisplayId(record);
				if (!displayID) {
					return null;
				}
				if (record.workshopID === undefined && record.overrides?.id) {
					return (
						<Tag key="id" style={APP_TAG_STYLES.neutral}>
							{displayID}
						</Tag>
					);
				}
				return displayID;
			};
		}
	},
	{
		title: MainColumnTitles.SIZE,
		dataIndex: 'size',
		width: 72,
		sorter: (a, b) => (a.size || 0) - (b.size || 0),
		renderSetup: () => {
			return (size?: number) => {
				const sizeStr = formatSizeLabel(size);
				if (!sizeStr || !size) {
					return null;
				}

				return (
					<Tag key="size" style={getSizeTagStyle(size)}>
						{sizeStr}
					</Tag>
				);
			};
		}
	},
	{
		title: MainColumnTitles.LAST_UPDATE,
		dataIndex: 'lastUpdate',
		width: 116,
		sorter: (a, b) => compareOptionalDates(a.lastUpdate, b.lastUpdate),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.LAST_WORKSHOP_UPDATE,
		dataIndex: 'lastWorkshopUpdate',
		width: 116,
		sorter: (a, b) => compareOptionalDates(a.lastWorkshopUpdate, b.lastWorkshopUpdate),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.DATE_ADDED,
		dataIndex: 'dateAdded',
		width: 116,
		sorter: (a, b) => compareOptionalDates(a.dateAdded, b.dateAdded),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.TAGS,
		dataIndex: 'tags',
		className: 'CollectionRowTags',
		width: 180,
		filtersSetup: (props: MainCollectionSchemaProps) => {
			return [...new Set(props.rows.flatMap((record) => getAllTags(record)))]
				.sort((left, right) => left.localeCompare(right))
				.map((tag) => ({ text: tag, value: tag }));
		},
		onFilter: (value, record) => {
			return getAllTags(record).includes(value.toString());
		},
		renderSetup: (props: MainCollectionSchemaProps) => {
			const { config } = props;
			const small = (config as MainCollectionConfig | undefined)?.smallRows;
			return (tags: string[] | undefined, record: DisplayModData) => {
				const iconTags: CorpType[] = [];
				const actualTags: string[] = [];
				const typeTags: TypeTag[] = [];
				const userTags: string[] = record.overrides?.tags || [];
				new Set([...(tags || []), ...userTags]).forEach((tag: string) => {
					const corp = getCorpType(tag);
					const type = getTypeTag(tag);
					if (tag.toLowerCase() !== 'mods') {
						if (corp != null) {
							iconTags.push(corp);
						} else if (type != null) {
							typeTags.push(type);
						} else {
							actualTags.push(tag);
						}
					}
				});
				return [
					...typeTags.map((type) => getTypeIcon(type, small ? 30 : 40)),
					...actualTags.map((tag) => (
						<Tag key={tag} style={APP_TAG_STYLES.accent}>
							{tag}
						</Tag>
					)),
					...iconTags.map((corp) => getCorpIcon(corp, small ? 30 : 40))
				];
			};
		}
	}
];

function getActiveColumnSchemas(config: MainCollectionConfig | undefined): ColumnSchema[] {
	let activeColumns: ColumnSchema[] = MAIN_COLUMN_SCHEMA;
	const columnActiveConfig = config?.columnActiveConfig;
	if (columnActiveConfig) {
		activeColumns = activeColumns.filter((colSchema) => columnActiveConfig[colSchema.title] || columnActiveConfig[colSchema.title] === undefined);
	}
	return activeColumns;
}

function getResponsiveActiveColumnSchemas(config: MainCollectionConfig | undefined, availableTableWidth = 0): ColumnSchema[] {
	const activeColumns = getActiveColumnSchemas(config);
	if (availableTableWidth <= 0) {
		return activeColumns;
	}

	return activeColumns.filter((column) => {
		const minimumResponsiveWidth = RESPONSIVE_COLUMN_MIN_TABLE_WIDTHS[column.title as MainColumnTitles];
		return minimumResponsiveWidth === undefined || availableTableWidth >= minimumResponsiveWidth;
	});
}

function getRowSelection(
	props: Pick<
		CollectionViewProps,
		'collection' | 'rows' | 'filteredRows' | 'setEnabledModsCallback' | 'setEnabledCallback' | 'setDisabledCallback'
	>
) {
	const { collection, rows, filteredRows, setEnabledModsCallback, setEnabledCallback, setDisabledCallback } = props;

	const rowSelection: TableRowSelection<DisplayModData> = {
		columnWidth: DEFAULT_SELECTION_COLUMN_WIDTH,
		selections: [Table.SELECTION_INVERT],
		selectedRowKeys: collection.mods,
		onChange: (selectedRowKeys: Key[]) => {
			const currentVisible = new Set(filteredRows.map((modData) => modData.uid));
			const currentSelection = collection.mods;
			const newSelection = rows
				.map((modData) => modData.uid)
				.filter((mod) => (!currentVisible.has(mod) && currentSelection.includes(mod)) || selectedRowKeys.includes(mod));
			setEnabledModsCallback(new Set(newSelection));
		},
		onSelect: (record: DisplayModData, selected: boolean) => {
			if (selected) {
				setEnabledCallback(record.uid);
			} else {
				setDisabledCallback(record.uid);
			}
		},
		onSelectAll: (selected: boolean) => {
			const currentVisible = filteredRows.map((modData) => modData.uid);
			const selectedMods = new Set(collection.mods);
			currentVisible.forEach((mod) => {
				if (selected) {
					selectedMods.add(mod);
				} else {
					selectedMods.delete(mod);
				}
			});
			setEnabledModsCallback(selectedMods);
		},
		onSelectInvert: () => {
			const currentVisible = filteredRows.map((modData) => modData.uid);
			const selected = new Set(collection.mods);
			currentVisible.forEach((mod) => {
				if (!selected.has(mod)) {
					selected.add(mod);
				} else {
					selected.delete(mod);
				}
			});
			setEnabledModsCallback(selected);
		},
		onSelectNone: () => {
			const currentVisible = filteredRows.map((modData) => modData.uid);
			const selected = new Set(collection.mods);
			currentVisible.forEach((mod) => {
				selected.delete(mod);
			});
			setEnabledModsCallback(selected);
		},
		getCheckboxProps: (record: DisplayModData) => {
			const displayName = getModDataDisplayName(record) || record.uid;
			return {
				'aria-label': `Include ${displayName} in collection`
			} as ReturnType<NonNullable<TableRowSelection<DisplayModData>['getCheckboxProps']>>;
		}
	};

	return rowSelection;
}

export function getColumnWidths(config: MainCollectionConfig | undefined, autoColumnWidths: Record<string, number> = {}, availableTableWidth = 0) {
	const configuredWidths = config?.columnWidthConfig || {};
	const columnWidths = getResponsiveActiveColumnSchemas(config, availableTableWidth).reduce<Record<string, number>>(
		(acc, column) => {
			if (column.width) {
				const minWidth = getMainColumnMinWidth(column.title as MainColumnTitles);
				const configuredWidth = configuredWidths[column.title] ?? autoColumnWidths[column.title] ?? column.width;
				acc[column.title] = Math.max(minWidth, configuredWidth);
			}
			return acc;
		},
		{}
	);

	const nameWidth = columnWidths[MainColumnTitles.NAME];
	const nameWidthIsConfigured = configuredWidths[MainColumnTitles.NAME] !== undefined;
	if (availableTableWidth > 0 && nameWidth !== undefined && !nameWidthIsConfigured) {
		const currentTableWidth = Object.values(columnWidths).reduce((totalWidth, columnWidth) => totalWidth + columnWidth, 0);
		const targetTableWidth = Math.max(0, Math.floor(availableTableWidth - DEFAULT_SELECTION_COLUMN_WIDTH));
		if (currentTableWidth < targetTableWidth) {
			columnWidths[MainColumnTitles.NAME] += targetTableWidth - currentTableWidth;
		}
	}

	return columnWidths;
}

function getColumnWidthVariableName(columnTitle: string) {
	return `--main-collection-column-width-${columnTitle
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')}`;
}

function getColumnWidthStyle(columnTitle: string, width: number) {
	return `var(${getColumnWidthVariableName(columnTitle)}, ${width}px)`;
}

function setColumnWidthVariable(container: HTMLElement | null, columnTitle: string, width: number) {
	container?.style.setProperty(getColumnWidthVariableName(columnTitle), `${width}px`);
}

function getColumnSchema(
	props: MainCollectionSchemaProps,
	columnWidthConfig?: Record<string, number>,
	availableTableWidth = 0
): ColumnType<DisplayModData>[] {
	const { config } = props;
	const activeColumns = getResponsiveActiveColumnSchemas(config as MainCollectionConfig | undefined, availableTableWidth);
	const defaultSortColumnTitle = activeColumns.some((column) => column.title === MainColumnTitles.NAME) ? MainColumnTitles.NAME : MainColumnTitles.ID;
	return activeColumns.map((colSchema: ColumnSchema) => {
		const { title, dataIndex, className, width, defaultSortOrder, sorter, sorterSetup, filters, filtersSetup, onFilter, align, renderSetup } = colSchema;
		return {
			title,
			dataIndex,
			className,
			width: columnWidthConfig?.[title] ?? width,
			defaultSortOrder: title === defaultSortColumnTitle ? defaultSortOrder || 'ascend' : undefined,
			filters: filtersSetup ? filtersSetup(props) : filters,
			onFilter,
			sorter: sorterSetup ? sorterSetup(props) : sorter,
			align,
			render: renderSetup ? renderSetup(props) : undefined
		};
	});
}

function MainCollectionViewComponent(props: CollectionViewProps) {
	const {
		collection,
		config,
		filteredRows,
		getModDetails,
		height,
		launchingGame,
		lastValidationStatus,
		openMainViewSettingsCallback,
		rows,
		setDisabledCallback,
		setEnabledCallback,
		setEnabledModsCallback,
		setMainColumnVisibilityCallback,
		setMainColumnWidthCallback,
		width
	} = props;
	const mainConfig = config as MainCollectionConfig | undefined;
	const small = mainConfig?.smallRows;
	const columnActiveConfig = mainConfig?.columnActiveConfig;
	const columnWidthConfig = mainConfig?.columnWidthConfig;
	const deferredRows = useDeferredValue(filteredRows);
	const configuredColumnWidths = useMemo(() => columnWidthConfig || {}, [columnWidthConfig]);
	const [autoColumnWidths, setAutoColumnWidths] = useState<Record<string, number>>({});
	const [availableTableWidth, setAvailableTableWidth] = useState(0);
	const manuallyActiveColumnTitles = useMemo(
		() => getActiveColumnSchemas(columnActiveConfig ? { columnActiveConfig } : undefined).map((column) => column.title),
		[columnActiveConfig]
	);
	const activeColumnTitles = useMemo(
		() => getResponsiveActiveColumnSchemas(columnActiveConfig ? { columnActiveConfig } : undefined, availableTableWidth).map((column) => column.title),
		[availableTableWidth, columnActiveConfig]
	);
	const hiddenColumnTitles = useMemo(
		() => ALL_MAIN_COLUMN_TITLES.filter((columnTitle) => !manuallyActiveColumnTitles.includes(columnTitle)),
		[manuallyActiveColumnTitles]
	);
	const sampledRows = useMemo(() => deferredRows.slice(0, COLUMN_MEASUREMENT_SAMPLE_SIZE), [deferredRows]);
	const measurementInputKey = useMemo(
		() => `${small ? 'compact' : 'comfortable'}::${getMeasurementRowSignature(deferredRows)}`,
		[deferredRows, small]
	);
	const measuredColumnTitles = useMemo(
		() => activeColumnTitles.filter((columnTitle) => AUTO_MEASURE_COLUMN_TITLES.has(columnTitle as MainColumnTitles)),
		[activeColumnTitles]
	);
	const selectedModMeasurementKey = useMemo(() => [...collection.mods].sort((left, right) => left.localeCompare(right)).join('|'), [collection.mods]);
	const measurementStateKey = useMemo(
		() => `${measurementInputKey}::mods=${selectedModMeasurementKey}::validated=${lastValidationStatus ? '1' : '0'}`,
		[lastValidationStatus, measurementInputKey, selectedModMeasurementKey]
	);
	const measurementCacheKey = useMemo(
		() => getColumnMeasurementCacheKey(measurementStateKey, measuredColumnTitles),
		[measuredColumnTitles, measurementStateKey]
	);
	const resolvedColumnWidths = useMemo(
		() => getColumnWidths(config as MainCollectionConfig | undefined, autoColumnWidths, availableTableWidth),
		[autoColumnWidths, availableTableWidth, config]
	);
	const tableRootRef = useRef<HTMLDivElement | null>(null);
	const syncedColumnTitlesRef = useRef<string[]>([]);

	useEffect(() => {
		const tableRoot = tableRootRef.current;
		if (!tableRoot) {
			return;
		}

		const syncAvailableWidth = (nextWidth: number) => {
			setAvailableTableWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
		};

		syncAvailableWidth(Math.round(tableRoot.clientWidth));

		if (typeof ResizeObserver === 'undefined') {
			const handleWindowResize = () => {
				syncAvailableWidth(Math.round(tableRoot.clientWidth));
			};
			window.addEventListener('resize', handleWindowResize);
			return () => {
				window.removeEventListener('resize', handleWindowResize);
			};
		}

		const resizeObserver = new ResizeObserver((entries) => {
			const nextWidth = Math.round(entries[0]?.contentRect.width ?? tableRoot.clientWidth);
			syncAvailableWidth(nextWidth);
		});
		resizeObserver.observe(tableRoot);
		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	useEffect(() => {
		const nextColumnTitles = Object.keys(resolvedColumnWidths);
		const activeColumnTitles = new Set(nextColumnTitles);
		syncedColumnTitlesRef.current.forEach((columnTitle) => {
			if (!activeColumnTitles.has(columnTitle)) {
				tableRootRef.current?.style.removeProperty(getColumnWidthVariableName(columnTitle));
			}
		});
		nextColumnTitles.forEach((columnTitle) => {
			setColumnWidthVariable(tableRootRef.current, columnTitle, resolvedColumnWidths[columnTitle]);
		});
		syncedColumnTitlesRef.current = nextColumnTitles;
	}, [resolvedColumnWidths]);

	useEffect(() => {
		const tableRoot = tableRootRef.current;
		const missingColumnTitles = measuredColumnTitles.filter((columnTitle) => configuredColumnWidths[columnTitle] === undefined);
		const shouldAutoMeasureColumns = deferredRows.length > 0 && deferredRows.length <= COLUMN_AUTO_MEASURE_MAX_ROWS;
		let cancelled = false;

		if (!tableRoot) {
			return;
		}

		const applyAutoColumnWidthUpdate = (nextWidths: Record<string, number>) => {
			setAutoColumnWidths((currentWidths) => (areColumnWidthMapsEqual(currentWidths, nextWidths) ? currentWidths : nextWidths));
		};

		if (!shouldAutoMeasureColumns) {
			applyAutoColumnWidthUpdate({});
			return;
		}

		if (missingColumnTitles.length === 0) {
			applyAutoColumnWidthUpdate({});
			return;
		}

		const cachedColumnWidths = columnMeasurementCache.get(measurementCacheKey);
		if (cachedColumnWidths) {
			applyAutoColumnWidthUpdate(cachedColumnWidths);
			return;
		}

		const runMeasurement = () => {
			if (cancelled) {
				return;
			}

			const renderedColumnCells = getRenderedColumnBodyCells(tableRoot, activeColumnTitles, sampledRows);
			const nextMeasuredWidths: Record<string, number> = {};

			missingColumnTitles.forEach((columnTitle) => {
				const measuredWidth = (renderedColumnCells[columnTitle] || []).reduce((largestWidth, renderedCell) => {
					return Math.max(largestWidth, measureBodyCellWidth(columnTitle as MainColumnTitles, renderedCell));
				}, 0);

				if (measuredWidth > 0) {
					nextMeasuredWidths[columnTitle] = Math.max(getMainColumnMinWidth(columnTitle as MainColumnTitles), measuredWidth);
				}
			});

			if (cancelled) {
				return;
			}

			cacheColumnMeasurements(measurementCacheKey, nextMeasuredWidths);
			setAutoColumnWidths((currentWidths) => {
				return areColumnWidthMapsEqual(currentWidths, nextMeasuredWidths) ? currentWidths : nextMeasuredWidths;
			});
		};

		if (typeof window.requestIdleCallback === 'function') {
			const idleHandle = window.requestIdleCallback(runMeasurement, { timeout: 200 });
			return () => {
				cancelled = true;
				window.cancelIdleCallback(idleHandle);
			};
		}

		const timeout = window.setTimeout(runMeasurement, 0);

		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [activeColumnTitles, configuredColumnWidths, deferredRows.length, measuredColumnTitles, measurementCacheKey, sampledRows]);

	const rowSelection = useMemo(
		() =>
			getRowSelection({
				collection,
				filteredRows: deferredRows,
				rows,
				setDisabledCallback,
				setEnabledCallback,
				setEnabledModsCallback
			}),
		[collection, deferredRows, rows, setDisabledCallback, setEnabledCallback, setEnabledModsCallback]
	);
	const tableComponents = useMemo(
		() => ({
			header: {
				cell: ResizableHeaderCell
			}
		}),
		[]
	);
	const columnSchemaProps = useMemo<MainCollectionSchemaProps>(
		() => ({
			collection,
			config,
			getModDetails,
			lastValidationStatus,
			rows
		}),
		[collection, config, getModDetails, lastValidationStatus, rows]
	);
	const columns = useMemo(() => {
		return getColumnSchema(columnSchemaProps, resolvedColumnWidths, availableTableWidth).map((column) => {
			const columnTitle = typeof column.title === 'string' ? column.title : undefined;
			const currentWidth = columnTitle ? resolvedColumnWidths[columnTitle] : undefined;
			if (!columnTitle || !currentWidth) {
				return column;
			}

			const typedColumnTitle = columnTitle as MainColumnTitles;
			const canHideColumn = canSetMainColumnVisibility(typedColumnTitle, false, columnActiveConfig);
			const contextMenuItems: NonNullable<MenuProps['items']> = [
				{
					key: `hide:${typedColumnTitle}`,
					label: `Hide ${typedColumnTitle}`,
					disabled: !canHideColumn
				}
			];

			if (hiddenColumnTitles.length > 0) {
				contextMenuItems.push({
					type: 'divider'
				});
				hiddenColumnTitles.forEach((hiddenColumnTitle) => {
					contextMenuItems.push({
						key: `show:${hiddenColumnTitle}`,
						label: `Show ${hiddenColumnTitle}`
					});
				});
			}

			if (openMainViewSettingsCallback) {
				contextMenuItems.push({
					type: 'divider'
				});
				contextMenuItems.push({
					key: 'view-options',
					label: 'View Options'
				});
			}

			const restorePersistedColumnWidth = () => {
				const persistedWidth = resolvedColumnWidths[columnTitle];
				if (persistedWidth === undefined) {
					tableRootRef.current?.style.removeProperty(getColumnWidthVariableName(columnTitle));
					return;
				}
				setColumnWidthVariable(tableRootRef.current, columnTitle, persistedWidth);
			};

			return {
				...column,
				width: getColumnWidthStyle(columnTitle, currentWidth),
				onHeaderCell: () =>
					({
						label: columnTitle,
						'data-column-title': columnTitle,
						width: getColumnWidthStyle(columnTitle, currentWidth),
						resizeWidth: currentWidth,
						minWidth: getMainColumnMinWidth(columnTitle as MainColumnTitles),
						headerMenu: {
							items: contextMenuItems,
							onClick: (info: { key: Key }) => {
								const key = info.key.toString();
								if (key === 'view-options') {
									openMainViewSettingsCallback?.();
									return;
								}

								if (key.startsWith('hide:')) {
									const targetColumn = key.slice('hide:'.length) as MainColumnTitles;
									if (!canSetMainColumnVisibility(targetColumn, false, columnActiveConfig)) {
										return;
									}
									void Promise.resolve(setMainColumnVisibilityCallback?.(targetColumn, false));
									return;
								}

								if (key.startsWith('show:')) {
									const targetColumn = key.slice('show:'.length) as MainColumnTitles;
									void Promise.resolve(setMainColumnVisibilityCallback?.(targetColumn, true));
								}
							}
						},
						onResize: (nextWidth: number) => {
							setColumnWidthVariable(tableRootRef.current, columnTitle, nextWidth);
						},
						onResizeEnd: (nextWidth: number) => {
							setColumnWidthVariable(tableRootRef.current, columnTitle, nextWidth);
							void (async () => {
								try {
									const persisted = await Promise.resolve(setMainColumnWidthCallback?.(columnTitle as MainColumnTitles, nextWidth));
									if (persisted !== false) {
										return;
									}
								} catch {
									// The caller reports write failures separately; this only restores the local preview width.
								}

								restorePersistedColumnWidth();
							})();
						}
					}) as ReturnType<NonNullable<ColumnType<DisplayModData>['onHeaderCell']>>,
				onCell: () =>
					({
						'data-column-title': columnTitle,
						style: {
							width: getColumnWidthStyle(columnTitle, currentWidth)
						}
					}) as ReturnType<NonNullable<ColumnType<DisplayModData>['onCell']>>
			};
		});
	}, [
		columnActiveConfig,
		columnSchemaProps,
		hiddenColumnTitles,
		openMainViewSettingsCallback,
		availableTableWidth,
		resolvedColumnWidths,
		setMainColumnVisibilityCallback,
		setMainColumnWidthCallback
	]);
	const tableScrollX = useMemo(() => {
		return Object.values(resolvedColumnWidths).reduce((totalWidth, columnWidth) => totalWidth + columnWidth, DEFAULT_SELECTION_COLUMN_WIDTH);
	}, [resolvedColumnWidths]);
	const handleRow = useCallback((record: DisplayModData) => {
		return {
			onContextMenu: () => {
				api.openModContextMenu(record);
			}
		};
	}, []);

	return (
		<div ref={tableRootRef} className="MainCollectionTableRoot" style={{ width: width ?? '100%', height: height ?? '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
			<Layout style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
				<Content key="main table" style={{ padding: '0px', minWidth: 0, minHeight: 0, overflow: 'auto', scrollbarWidth: 'none' }}>
					<Table
						dataSource={deferredRows}
						pagination={false}
						loading={launchingGame}
						size="small"
						tableLayout="fixed"
						rowKey="uid"
						rowSelection={rowSelection}
						components={tableComponents}
						columns={columns}
						sortDirections={TABLE_SORT_DIRECTIONS}
						sticky
						scroll={{ x: tableScrollX }}
						onRow={handleRow}
						rowClassName={() => (small ? 'CompactModRow' : '')}
					/>
				</Content>
			</Layout>
		</div>
	);
}

export const MainCollectionView = memo(MainCollectionViewComponent);

function MainCollectionComponent() {
	const props = useOutletContext<CollectionViewProps>();
	return <MainCollectionView {...props} />;
}

export default memo(MainCollectionComponent);
