import { useOutletContext } from 'react-router-dom';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Key, ReactNode } from 'react';
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Clock3, Code2, HardDrive, LoaderCircle, TriangleAlert } from 'lucide-react';
import api from 'renderer/Api';
import { getCollectionSelectionState, setVisibleCollectionRowsSelected } from 'renderer/collection-mod-projection';
import { markPerfInteraction, measurePerf } from 'renderer/perf';
import { useMainCollectionTableStore, type MainSortState } from 'renderer/state/main-collection-table-store';
import { APP_TAG_STYLES, APP_THEME_COLORS } from 'renderer/theme';
import {
	MainCollectionVirtualHeaderRow,
	getMainCollectionHeaderColumnBehavior,
	type MainCollectionHeaderColumn,
	type ResizableHeaderCellProps
} from './main-collection-header';
import {
	MainCollectionVirtualRow,
	SelectionCheckbox,
	type MainCollectionCellRenderer,
	type MainCollectionRowColumn
} from './main-collection-row';
import {
	ALL_MAIN_COLUMN_TITLES,
	AUTO_MEASURE_MAIN_COLUMN_TITLES,
	COLUMN_AUTO_MEASURE_MAX_ROWS,
	COLUMN_MEASUREMENT_SAMPLE_SIZE,
	DEFAULT_SELECTION_COLUMN_WIDTH,
	areColumnWidthMapsEqual,
	cacheColumnMeasurements,
	formatSizeLabel,
	getActiveMainColumnTitles,
	getAllTags,
	getCachedColumnMeasurements,
	getColumnMeasurementCacheKey,
	getColumnPixelWidth,
	getColumnWidthVariableName,
	getColumnWidths,
	getDefaultMainColumnWidth,
	getMainCollectionTableScrollWidth,
	getMeasurementRowSignature,
	getRenderedColumnBodyCells,
	getResponsiveMainColumnTitles,
	measureBodyCellWidth,
	setColumnWidthVariable
} from './main-collection-table-layout';
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

const SIZE_COLOR_MIN_BYTES = 10 * 1024;
const SIZE_COLOR_MAX_BYTES = 100 * 1024 * 1024;
const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;
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
function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function parseRgbColor(color: string): [number, number, number] {
	const normalized = color.trim();
	if (normalized.startsWith('#')) {
		const hexValue = normalized.slice(1);
		const expanded =
			hexValue.length === 3
				? hexValue
						.split('')
						.map((value) => `${value}${value}`)
						.join('')
				: hexValue;
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

function getSizeColorBandIndex(size: number) {
	const normalizedSize = Math.max(size, SIZE_COLOR_MIN_BYTES);
	return SIZE_COLOR_BANDS.findIndex((band) => normalizedSize <= band.upperBound);
}

function getSizeBandProgress(size: number, bandIndex: number) {
	const lowerBound = bandIndex === 0 ? SIZE_COLOR_MIN_BYTES : SIZE_COLOR_BANDS[bandIndex - 1].upperBound;
	const upperBound = Number.isFinite(SIZE_COLOR_BANDS[bandIndex].upperBound)
		? SIZE_COLOR_BANDS[bandIndex].upperBound
		: SIZE_COLOR_MAX_BYTES;
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

function MainCollectionTag({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
	return (
		<span className={`MainCollectionTag${className ? ` ${className}` : ''}`} style={style}>
			{children}
		</span>
	);
}

function MainCollectionIcon({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
	return (
		<span className={`MainCollectionIcon${className ? ` ${className}` : ''}`} role="img" aria-label={label} title={label}>
			{children}
		</span>
	);
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
				<MainCollectionIcon label={label}>
					<HardDrive size={size} aria-hidden="true" />
				</MainCollectionIcon>
			);
		case ModType.TTQMM:
			return <img src={ttmm} width={size} alt={label} key="type" title={label} />;
		case ModType.WORKSHOP:
			return <img src={steam} width={size} alt={label} key="type" title={label} />;
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
	const label = type === TypeTag.SKINS ? 'Skins' : type === TypeTag.BLOCKS ? 'Blocks' : type === TypeTag.CORPS ? 'Custom corps' : 'Tag';
	switch (type) {
		case TypeTag.SKINS:
			return <img src={Icon_Skins} width={size - 14} alt={label} title={label} key={type} />;
		case TypeTag.BLOCKS:
			return <img src={Icon_Blocks} width={size} alt={label} title={label} key={type} />;
		case TypeTag.CORPS:
			return <img src={Icon_Corps} width={size - 10} alt={label} title={label} key={type} />;
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
			return <img src={Corp_Icon_HE} width={size} alt={label} title={label} key={type} />;
		case CorpType.GSO:
			return <img src={Corp_Icon_GSO} width={size} alt={label} title={label} key={type} />;
		case CorpType.GC:
			return <img src={Corp_Icon_GC} width={size} alt={label} title={label} key={type} />;
		case CorpType.BF:
			return <img src={Corp_Icon_BF} width={size} alt={label} title={label} key={type} />;
		case CorpType.RR:
			return <img src={Corp_Icon_RR} width={size} alt={label} title={label} key={type} />;
		case CorpType.SPE:
			return <img src={Corp_Icon_SPE} width={size} alt={label} title={label} key={type} />;
		case CorpType.VEN:
			return <img src={Corp_Icon_VEN} width={size} alt={label} title={label} key={type} />;
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
	filters?: MainCollectionFilter[];
	filtersSetup?: (props: MainCollectionSchemaProps) => MainCollectionFilter[];
	onFilter?: (value: boolean | Key, record: DisplayModData) => boolean;
	sorter?: MainCollectionSorter;
	sorterSetup?: (props: MainCollectionSchemaProps) => MainCollectionSorter;
	renderSetup?: (props: MainCollectionSchemaProps) => MainCollectionCellRenderer;
}

type MainCollectionSchemaProps = Pick<CollectionViewProps, 'collection' | 'config' | 'getModDetails' | 'lastValidationStatus' | 'rows'>;

interface MainCollectionFilter {
	text: string;
	value: Key;
}

type MainCollectionSortOrder = 'ascend' | 'descend' | null | undefined;
type MainCollectionSorter =
	| ((a: DisplayModData, b: DisplayModData, sortOrder?: MainCollectionSortOrder) => number)
	| { compare?: (a: DisplayModData, b: DisplayModData, sortOrder?: MainCollectionSortOrder) => number }
	| undefined;
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

function getStateTags(
	props: Pick<MainCollectionSchemaProps, 'collection' | 'lastValidationStatus'>,
	record: DisplayModData
): StateTagConfig[] {
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
		width: getDefaultMainColumnWidth(MainColumnTitles.TYPE),
		align: 'center'
	},
	{
		title: MainColumnTitles.NAME,
		dataIndex: 'name',
		className: 'CollectionRowModName',
		width: getDefaultMainColumnWidth(MainColumnTitles.NAME),
		defaultSortOrder: 'ascend',
		sorter: compareModDataDisplayName,
		renderSetup: (props: MainCollectionSchemaProps) => {
			const small = (props.config as MainCollectionConfig | undefined)?.smallRows;
			return (_name: string, record: DisplayModData) => {
				let updateIcon = null;
				let updateTone: 'danger' | 'warning' | undefined;
				const { needsUpdate, downloadPending, downloading, uid, hasCode } = record;
				if (needsUpdate) {
					updateIcon = (
						<MainCollectionIcon label="Needs update" className="MainCollectionStatusIcon MainCollectionStatusIcon--danger">
							<TriangleAlert size={16} aria-hidden="true" />
						</MainCollectionIcon>
					);
					updateTone = 'danger';
					if (downloadPending) {
						updateIcon = (
							<MainCollectionIcon label="Download pending" className="MainCollectionStatusIcon MainCollectionStatusIcon--warning">
								<Clock3 size={16} aria-hidden="true" />
							</MainCollectionIcon>
						);
						updateTone = 'warning';
					}
					if (downloading) {
						updateIcon = (
							<MainCollectionIcon
								label="Downloading"
								className="MainCollectionStatusIcon MainCollectionStatusIcon--warning MainCollectionStatusIcon--spin"
							>
								<LoaderCircle size={16} aria-hidden="true" />
							</MainCollectionIcon>
						);
						updateTone = 'warning';
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
						<span className={`CollectionNameLabel${needsUpdate ? ' is-strong' : ''}${updateTone ? ` is-${updateTone}` : ''}`}>
							{` ${displayName} `}
						</span>
						{hasCode ? (
							<MainCollectionIcon label="Contains code" className="MainCollectionStatusIcon MainCollectionStatusIcon--success">
								<Code2 size={16} aria-hidden="true" />
							</MainCollectionIcon>
						) : null}
					</button>
				);
			};
		}
	},
	{
		title: MainColumnTitles.AUTHORS,
		dataIndex: 'authors',
		width: getDefaultMainColumnWidth(MainColumnTitles.AUTHORS),
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
				return (authors || []).map((author) => <MainCollectionTag key={author}>{author}</MainCollectionTag>);
			};
		}
	},
	{
		title: MainColumnTitles.STATE,
		dataIndex: 'errors',
		width: getDefaultMainColumnWidth(MainColumnTitles.STATE),
		sorterSetup: (props: MainCollectionSchemaProps) => {
			return (a: DisplayModData, b: DisplayModData) => compareStateTags(getStateTags(props, a), getStateTags(props, b));
		},
		renderSetup: (props: MainCollectionSchemaProps) => {
			return (_errors: ModErrors | undefined, record: DisplayModData) => {
				const stateTags = getStateTags(props, record);
				if (stateTags.length > 0) {
					return stateTags.map((tagConfig) => (
						<MainCollectionTag key={tagConfig.text} style={APP_TAG_STYLES[tagConfig.tone || 'neutral']}>
							{tagConfig.text}
						</MainCollectionTag>
					));
				}
				return null;
			};
		}
	},
	{
		title: MainColumnTitles.ID,
		dataIndex: 'id',
		width: getDefaultMainColumnWidth(MainColumnTitles.ID),
		sorter: compareModDataDisplayId,
		renderSetup: () => {
			return (_: string, record: DisplayModData) => {
				const displayID = getModDataDisplayId(record);
				if (!displayID) {
					return null;
				}
				if (record.workshopID === undefined && record.overrides?.id) {
					return (
						<MainCollectionTag key="id" style={APP_TAG_STYLES.neutral}>
							{displayID}
						</MainCollectionTag>
					);
				}
				return displayID;
			};
		}
	},
	{
		title: MainColumnTitles.SIZE,
		dataIndex: 'size',
		width: getDefaultMainColumnWidth(MainColumnTitles.SIZE),
		sorter: (a, b) => (a.size || 0) - (b.size || 0),
		renderSetup: () => {
			return (size?: number) => {
				const sizeStr = formatSizeLabel(size);
				if (!sizeStr || !size) {
					return null;
				}

				return (
					<MainCollectionTag key="size" style={getSizeTagStyle(size)}>
						{sizeStr}
					</MainCollectionTag>
				);
			};
		}
	},
	{
		title: MainColumnTitles.LAST_UPDATE,
		dataIndex: 'lastUpdate',
		width: getDefaultMainColumnWidth(MainColumnTitles.LAST_UPDATE),
		sorter: (a, b) => compareOptionalDates(a.lastUpdate, b.lastUpdate),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.LAST_WORKSHOP_UPDATE,
		dataIndex: 'lastWorkshopUpdate',
		width: getDefaultMainColumnWidth(MainColumnTitles.LAST_WORKSHOP_UPDATE),
		sorter: (a, b) => compareOptionalDates(a.lastWorkshopUpdate, b.lastWorkshopUpdate),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.DATE_ADDED,
		dataIndex: 'dateAdded',
		width: getDefaultMainColumnWidth(MainColumnTitles.DATE_ADDED),
		sorter: (a, b) => compareOptionalDates(a.dateAdded, b.dateAdded),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.TAGS,
		dataIndex: 'tags',
		className: 'CollectionRowTags',
		width: getDefaultMainColumnWidth(MainColumnTitles.TAGS),
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
						<MainCollectionTag key={tag} style={APP_TAG_STYLES.accent}>
							{tag}
						</MainCollectionTag>
					)),
					...iconTags.map((corp) => getCorpIcon(corp, small ? 30 : 40))
				];
			};
		}
	}
];

const mainColumnSchemaByTitle = new Map(MAIN_COLUMN_SCHEMA.map((column) => [column.title, column]));

function getResponsiveActiveColumnSchemas(config: MainCollectionConfig | undefined, availableTableWidth = 0): ColumnSchema[] {
	return getResponsiveMainColumnTitles(config, availableTableWidth)
		.map((columnTitle) => mainColumnSchemaByTitle.get(columnTitle))
		.filter((column): column is ColumnSchema => !!column);
}

function getColumnSchema(
	props: MainCollectionSchemaProps,
	columnWidthConfig?: Record<string, number>,
	availableTableWidth = 0
): MainCollectionTableColumn[] {
	const { config } = props;
	const activeColumns = getResponsiveActiveColumnSchemas(config as MainCollectionConfig | undefined, availableTableWidth);
	const defaultSortColumnTitle = activeColumns.some((column) => column.title === MainColumnTitles.NAME)
		? MainColumnTitles.NAME
		: MainColumnTitles.ID;
	return activeColumns.map((colSchema: ColumnSchema) => {
		const {
			title,
			dataIndex,
			className,
			width,
			defaultSortOrder,
			sorter,
			sorterSetup,
			filters,
			filtersSetup,
			onFilter,
			align,
			renderSetup
		} = colSchema;
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

interface MainCollectionTableColumn extends MainCollectionRowColumn, MainCollectionHeaderColumn {
	title: string;
	dataIndex: string;
	className?: string;
	align?: 'center';
	width?: number | string;
	resizeWidth?: number;
	sorter?: MainCollectionSorter;
	onHeaderCell?: (column: MainCollectionTableColumn) => ResizableHeaderCellProps;
}

function getSorterCompare(sorter: MainCollectionSorter) {
	if (typeof sorter === 'function') {
		return sorter;
	}

	if (sorter && typeof sorter === 'object' && 'compare' in sorter && typeof sorter.compare === 'function') {
		return sorter.compare;
	}

	return undefined;
}

function sortRows(rows: DisplayModData[], columns: MainCollectionTableColumn[], sortState: MainSortState) {
	return measurePerf(
		'collection.table.sortRows',
		() => {
			const column = columns.find((candidate) => candidate.title === sortState.columnTitle);
			const compare = getSorterCompare(column?.sorter);
			if (!compare) {
				return rows;
			}

			const direction = sortState.order === 'ascend' ? 1 : -1;
			return [...rows].sort((left, right) => direction * compare(left, right, sortState.order));
		},
		{
			rows: rows.length,
			column: sortState.columnTitle,
			order: sortState.order
		}
	);
}

function getHeaderCellProps(column: MainCollectionTableColumn) {
	return column.onHeaderCell?.(column);
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
		setMainColumnOrderCallback,
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
	const [draggingColumnTitle, setDraggingColumnTitle] = useState<MainColumnTitles>();
	const manuallyActiveColumnTitles = useMemo(
		() => getActiveMainColumnTitles(columnActiveConfig ? { columnActiveConfig } : undefined),
		[columnActiveConfig]
	);
	const activeColumnTitles = useMemo(
		() => getResponsiveMainColumnTitles(columnActiveConfig ? { columnActiveConfig } : undefined, availableTableWidth),
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
		() => activeColumnTitles.filter((columnTitle) => AUTO_MEASURE_MAIN_COLUMN_TITLES.has(columnTitle)),
		[activeColumnTitles]
	);
	const selectedModMeasurementKey = useMemo(
		() => [...collection.mods].sort((left, right) => left.localeCompare(right)).join('|'),
		[collection.mods]
	);
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

		const cachedColumnWidths = getCachedColumnMeasurements(measurementCacheKey);
		if (cachedColumnWidths) {
			applyAutoColumnWidthUpdate(cachedColumnWidths);
			return;
		}

		const runMeasurement = () => {
			if (cancelled) {
				return;
			}

			const nextMeasuredWidths = measurePerf(
				'collection.table.autoMeasureColumns',
				() => {
					const renderedColumnCells = getRenderedColumnBodyCells(tableRoot, activeColumnTitles, sampledRows);
					const measuredWidths: Record<string, number> = {};

					missingColumnTitles.forEach((columnTitle) => {
						const measuredWidth = (renderedColumnCells[columnTitle] || []).reduce((largestWidth, renderedCell) => {
							return Math.max(largestWidth, measureBodyCellWidth(columnTitle as MainColumnTitles, renderedCell));
						}, 0);

						if (measuredWidth > 0) {
							measuredWidths[columnTitle] = Math.max(getMainColumnMinWidth(columnTitle as MainColumnTitles), measuredWidth);
						}
					});

					return measuredWidths;
				},
				{
					columns: missingColumnTitles.length,
					rows: sampledRows.length
				}
			);

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
	const sortState = useMainCollectionTableStore((state) => state.sortState);
	const setSortState = useMainCollectionTableStore((state) => state.setSortState);
	const columns = useMemo<MainCollectionTableColumn[]>(() => {
		return getColumnSchema(columnSchemaProps, resolvedColumnWidths, availableTableWidth).map((column) => {
			const columnTitle = typeof column.title === 'string' ? column.title : undefined;
			const currentWidth = columnTitle ? resolvedColumnWidths[columnTitle] : undefined;
			if (!columnTitle || !currentWidth) {
				return column;
			}

			const typedColumnTitle = columnTitle as MainColumnTitles;
			return {
				...column,
				...getMainCollectionHeaderColumnBehavior(typedColumnTitle, {
					columnActiveConfig,
					currentWidth,
					draggingColumnTitle,
					hiddenColumnTitles,
					openMainViewSettingsCallback,
					resolvedColumnWidths,
					setDraggingColumnTitle,
					setMainColumnOrderCallback,
					setMainColumnVisibilityCallback,
					setMainColumnWidthCallback,
					tableRootRef
				})
			};
		}) as MainCollectionTableColumn[];
	}, [
		columnActiveConfig,
		columnSchemaProps,
		draggingColumnTitle,
		hiddenColumnTitles,
		openMainViewSettingsCallback,
		availableTableWidth,
		resolvedColumnWidths,
		setMainColumnOrderCallback,
		setMainColumnVisibilityCallback,
		setMainColumnWidthCallback
	]);
	useEffect(() => {
		if (columns.some((column) => column.title === sortState.columnTitle && getSorterCompare(column.sorter))) {
			return;
		}

		const defaultColumn =
			columns.find((column) => column.title === MainColumnTitles.NAME && getSorterCompare(column.sorter)) ??
			columns.find((column) => getSorterCompare(column.sorter));
		if (defaultColumn) {
			setSortState({ columnTitle: defaultColumn.title, order: 'ascend' });
		}
	}, [columns, setSortState, sortState.columnTitle]);
	const sortedRows = useMemo(() => sortRows(deferredRows, columns, sortState), [columns, deferredRows, sortState]);
	const tableColumnDefs = useMemo<ColumnDef<DisplayModData>[]>(
		() => [
			{
				id: '__selection',
				size: DEFAULT_SELECTION_COLUMN_WIDTH
			},
			...columns.map((column) => ({
				id: column.title,
				accessorKey: column.dataIndex,
				size: getColumnPixelWidth(column)
			}))
		],
		[columns]
	);
	const table = useReactTable({
		data: sortedRows,
		columns: tableColumnDefs,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.uid
	});
	const tableRows = table.getRowModel().rows;
	const tableScrollX = useMemo(() => {
		return getMainCollectionTableScrollWidth(resolvedColumnWidths);
	}, [resolvedColumnWidths]);
	const scrollParentRef = useRef<HTMLDivElement | null>(null);
	const rowVirtualizer = useVirtualizer({
		count: tableRows.length,
		getScrollElement: () => scrollParentRef.current,
		estimateSize: () => (small ? 48 : 56),
		overscan: 12,
		initialRect: {
			height: typeof height === 'number' ? height : 640,
			width: typeof width === 'number' ? width : 1024
		},
		measureElement: (element) => element.getBoundingClientRect().height
	});
	const estimatedRowHeight = small ? 48 : 56;
	const virtualRows = rowVirtualizer.getVirtualItems();
	const renderedVirtualRows =
		virtualRows.length > 0
			? virtualRows
			: tableRows.slice(0, Math.min(tableRows.length, 50)).map((_, index) => ({
					index,
					start: index * estimatedRowHeight
				}));
	const virtualBodyHeight = Math.max(rowVirtualizer.getTotalSize(), tableRows.length * estimatedRowHeight);
	const selectionState = useMemo(() => getCollectionSelectionState(collection.mods, sortedRows), [collection.mods, sortedRows]);
	const setAllVisibleSelected = useCallback(
		(selected: boolean) => {
			markPerfInteraction('collection.rowSelect.allVisible', {
				selected,
				rows: sortedRows.length
			});
			setEnabledModsCallback(setVisibleCollectionRowsSelected(collection.mods, sortedRows, selected));
		},
		[collection.mods, setEnabledModsCallback, sortedRows]
	);
	const setRowSelected = useCallback(
		(record: DisplayModData, selected: boolean) => {
			markPerfInteraction('collection.rowSelect.single', {
				selected,
				uid: record.uid
			});
			if (selected) {
				setEnabledCallback(record.uid);
			} else {
				setDisabledCallback(record.uid);
			}
		},
		[setDisabledCallback, setEnabledCallback]
	);
	const openRowContextMenu = useCallback((record: DisplayModData) => {
		api.openModContextMenu(record);
	}, []);

	return (
		<div
			ref={tableRootRef}
			className="MainCollectionTableRoot"
			style={{ width: width ?? '100%', height: height ?? '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
		>
			<div className={`MainCollectionVirtualShell${launchingGame ? ' is-loading' : ''}`}>
				<div ref={scrollParentRef} className="MainCollectionVirtualScroll">
					<table className="MainCollectionVirtualTable" style={{ width: tableScrollX, minWidth: '100%' }}>
						<thead className="MainCollectionVirtualTableHeader">
							<MainCollectionVirtualHeaderRow
								columns={columns}
								selectionControl={
									<SelectionCheckbox
										aria-label="Include all visible mods in collection"
										checked={selectionState.allVisibleSelected}
										indeterminate={selectionState.someVisibleSelected}
										onChange={setAllVisibleSelected}
									/>
								}
								sortState={sortState}
								sortedRowsCount={sortedRows.length}
								getHeaderCellProps={getHeaderCellProps}
								isColumnSortable={(column) => !!getSorterCompare(column.sorter)}
								onSortStateChange={setSortState}
							/>
						</thead>
						<tbody className="MainCollectionVirtualTableBody" style={{ height: virtualBodyHeight }}>
							{renderedVirtualRows.map((virtualRow) => {
								const row = tableRows[virtualRow.index];
								if (!row) {
									return null;
								}

								const record = row.original;
								const selected = selectionState.selectedMods.has(record.uid);
								return (
									<MainCollectionVirtualRow
										key={row.id}
										columns={columns}
										measureElement={rowVirtualizer.measureElement}
										record={record}
										rowId={row.id}
										rowIndex={virtualRow.index}
										selected={selected}
										small={small}
										start={virtualRow.start}
										onContextMenu={() => {
											openRowContextMenu(record);
										}}
										onSelectedChange={setRowSelected}
									/>
								);
							})}
						</tbody>
					</table>
				</div>
				{launchingGame ? <div className="MainCollectionVirtualLoading">Launching game...</div> : null}
			</div>
		</div>
	);
}

export const MainCollectionView = memo(MainCollectionViewComponent);

function MainCollectionComponent() {
	const props = useOutletContext<CollectionViewProps>();
	return <MainCollectionView {...props} />;
}

export default memo(MainCollectionComponent);
