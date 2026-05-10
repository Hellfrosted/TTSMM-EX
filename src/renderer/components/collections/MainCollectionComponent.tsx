import { useOutletContext } from 'react-router-dom';
import { memo, useCallback, useDeferredValue, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, Key, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, Clock3, Code2, Filter, LoaderCircle, PanelRightOpen, TriangleAlert, X } from 'lucide-react';
import api from 'renderer/Api';
import { markPerfInteraction, measurePerf } from 'renderer/perf';
import { useMainCollectionTableStore } from 'renderer/state/main-collection-table-store';
import { APP_TAG_STYLES } from 'renderer/theme';
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
	AUTO_MEASURE_MAIN_COLUMN_TITLES,
	COLUMN_AUTO_MEASURE_MAX_ROWS,
	COLUMN_MEASUREMENT_SAMPLE_SIZE,
	DEFAULT_SELECTION_COLUMN_WIDTH,
	areColumnWidthMapsEqual,
	cacheColumnMeasurements,
	formatSizeLabel,
	getAllTags,
	getCachedColumnMeasurements,
	getColumnMeasurementCacheKey,
	getColumnWidthVariableName,
	getDefaultMainColumnWidth,
	getMainCollectionAvailableTableWidth,
	getMainCollectionTableScrollWidth,
	getMeasurementRowSignature,
	getRenderedColumnBodyCells,
	measureBodyCellWidth,
	setColumnWidthVariable
} from './main-collection-table-layout';
import {
	createMainCollectionTableModel,
	getMainCollectionDefaultSortState,
	getMainCollectionSelectionModel,
	getMainCollectionSorterCompare,
	sortMainCollectionRows,
	type MainCollectionSorter
} from './main-collection-table-model';
import {
	CollectionViewProps,
	DisplayModData,
	MainCollectionConfig,
	MainCollectionTableCommands,
	MainColumnTitles,
	ModErrors,
	ModType,
	getModDataDisplayName,
	compareModDataDisplayName,
	getModDataDisplayId,
	compareModDataDisplayId,
	CorpType,
	getCorpType,
	getCollectionStatusTags,
	type CollectionStatusTag
} from 'model';
import { getResolvedMainColumnMinWidth } from 'shared/main-collection-view-config';
import { formatDateStr } from 'util/Date';

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
import { getModTypeLabel, ModTypeIcon } from './mod-type-presentation';

const SIZE_COLOR_MAX_BYTES = 100 * 1024 * 1024;
const SIZE_METER_MIN_BYTES = 10 * 1024;
const MAIN_COLLECTION_VIRTUAL_OVERSCAN = 28;
const VIRTUAL_SCROLLING_RESET_DELAY_MS = 120;
const TAG_FILTER_MENU_WIDTH = 236;

function useCoarsePointer() {
	const [coarsePointer, setCoarsePointer] = useState(() =>
		typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false
	);

	useEffect(() => {
		if (typeof window.matchMedia !== 'function') {
			return;
		}

		const query = window.matchMedia('(pointer: coarse)');
		const update = () => {
			setCoarsePointer(query.matches);
		};

		update();
		query.addEventListener?.('change', update);

		return () => {
			query.removeEventListener?.('change', update);
		};
	}, []);

	return coarsePointer;
}

interface MainTableMeasurementState {
	autoColumnWidths: Record<string, number>;
	availableTableWidth: number;
}

type MainTableMeasurementAction =
	| { type: 'available-width-measured'; width: number }
	| { type: 'auto-widths-measured'; widths: Record<string, number> };

function mainTableMeasurementReducer(state: MainTableMeasurementState, action: MainTableMeasurementAction): MainTableMeasurementState {
	switch (action.type) {
		case 'available-width-measured':
			return state.availableTableWidth === action.width ? state : { ...state, availableTableWidth: action.width };
		case 'auto-widths-measured':
			return areColumnWidthMapsEqual(state.autoColumnWidths, action.widths) ? state : { ...state, autoColumnWidths: action.widths };
		default:
			return state;
	}
}

function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function getTableNavigationIndex(key: string, currentIndex: number | undefined, rowCount: number) {
	if (rowCount <= 0) {
		return undefined;
	}
	if (key === 'ArrowUp') {
		return currentIndex === undefined || currentIndex < 0 ? 0 : clampNumber(currentIndex - 1, 0, rowCount - 1);
	}
	if (key === 'ArrowDown') {
		return currentIndex === undefined || currentIndex < 0 ? 0 : clampNumber(currentIndex + 1, 0, rowCount - 1);
	}
	if (key === 'Home') {
		return 0;
	}
	if (key === 'End') {
		return rowCount - 1;
	}
	return undefined;
}

function isMainCollectionKeyboardNavigationTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) {
		return true;
	}

	return !target.closest('input,select,textarea,[role="slider"],[contenteditable="true"]');
}

function isMainCollectionRowFocusTarget(target: Element, scrollParent: HTMLElement) {
	const row = target.closest('.MainCollectionVirtualRow');
	return !!row && scrollParent.contains(row) && isMainCollectionKeyboardNavigationTarget(target);
}

function getMainCollectionEventRowIndex(currentTarget: EventTarget | null) {
	if (!(currentTarget instanceof HTMLElement)) {
		return undefined;
	}

	const row = currentTarget.closest('.MainCollectionVirtualRow');
	const rowIndex = Number(row?.getAttribute('data-index'));
	return Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : undefined;
}

function getSizeMeterStyle(size: number): CSSProperties {
	const clampedSize = clampNumber(size, SIZE_METER_MIN_BYTES, SIZE_COLOR_MAX_BYTES);
	const progress =
		(Math.log(clampedSize) - Math.log(SIZE_METER_MIN_BYTES)) / (Math.log(SIZE_COLOR_MAX_BYTES) - Math.log(SIZE_METER_MIN_BYTES) || 1);

	return {
		'--main-collection-size-meter-scale': Math.max(0.08, clampNumber(progress, 0, 1))
	} as CSSProperties;
}

function MainCollectionTag({
	children,
	className = '',
	style,
	title
}: {
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	title?: string;
}) {
	return (
		<span className={`MainCollectionTag${className ? ` ${className}` : ''}`} style={style} title={title}>
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

function compareModType(left: DisplayModData, right: DisplayModData) {
	const typeComparison = getModTypeLabel(left.type).localeCompare(getModTypeLabel(right.type));
	return typeComparison || compareModDataDisplayName(left, right);
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
	align?: 'left' | 'center' | 'right';
	defaultSortOrder?: 'ascend';
	filters?: MainCollectionFilter[];
	filtersSetup?: (props: MainCollectionSchemaProps) => MainCollectionFilter[];
	onFilter?: (value: boolean | Key, record: DisplayModData) => boolean;
	sorter?: MainCollectionSorter;
	headerAccessorySetup?: (props: MainCollectionSchemaProps) => ReactNode;
	sorterSetup?: (props: MainCollectionSchemaProps) => MainCollectionSorter;
	renderSetup?: (props: MainCollectionSchemaProps) => MainCollectionCellRenderer;
}

type MainCollectionSchemaProps = Pick<CollectionViewProps, 'collection' | 'config' | 'lastValidationStatus' | 'rows'> & {
	availableTags: string[];
	getModDetails: MainCollectionTableCommands['getModDetails'];
	onSelectedTagsChange?: (tags: string[]) => void;
	selectedTags: string[];
};

interface MainCollectionFilter {
	text: string;
	value: Key;
}

function compareOptionalDates(a?: Date, b?: Date) {
	const left = a ? a.getTime() : 0;
	const right = b ? b.getTime() : 0;
	return left - right;
}

function getStateTags(
	props: Pick<MainCollectionSchemaProps, 'collection' | 'lastValidationStatus'>,
	record: DisplayModData
): CollectionStatusTag[] {
	return getCollectionStatusTags({
		lastValidationStatus: props.lastValidationStatus,
		record,
		selectedMods: props.collection.mods
	});
}

function compareStateTags(leftTags: CollectionStatusTag[], rightTags: CollectionStatusTag[]) {
	const leftRank = leftTags.length > 0 ? Math.min(...leftTags.map((tag) => tag.rank)) : Number.MAX_SAFE_INTEGER;
	const rightRank = rightTags.length > 0 ? Math.min(...rightTags.map((tag) => tag.rank)) : Number.MAX_SAFE_INTEGER;
	if (leftRank !== rightRank) {
		return leftRank - rightRank;
	}

	const leftLabel = leftTags.map((tag) => tag.text).join(', ');
	const rightLabel = rightTags.map((tag) => tag.text).join(', ');
	return leftLabel.localeCompare(rightLabel);
}

function compareTagLabels(left: DisplayModData, right: DisplayModData) {
	const leftLabel = getAllTags(left).join(', ');
	const rightLabel = getAllTags(right).join(', ');
	return leftLabel.localeCompare(rightLabel) || compareModDataDisplayName(left, right);
}

function TagsHeaderFilter({
	availableTags,
	onSelectedTagsChange,
	selectedTags
}: {
	availableTags: string[];
	onSelectedTagsChange?: (tags: string[]) => void;
	selectedTags: string[];
}) {
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
	const selectedTagSet = new Set(selectedTags);
	const disabled = !onSelectedTagsChange || (selectedTags.length === 0 && availableTags.length === 0);
	const activeLabel = selectedTags.length > 0 ? `${selectedTags.length}` : undefined;

	const closeMenu = useCallback((restoreFocus = true) => {
		setMenuPosition(null);
		if (restoreFocus) {
			buttonRef.current?.focus();
		}
	}, []);
	const closeMenuFromEffect = useEffectEvent((restoreFocus?: boolean) => {
		closeMenu(restoreFocus);
	});

	const openMenu = useCallback(() => {
		const bounds = buttonRef.current?.getBoundingClientRect();
		if (!bounds) {
			return;
		}
		setMenuPosition({
			x: Math.min(Math.max(8, bounds.right - TAG_FILTER_MENU_WIDTH), Math.max(8, window.innerWidth - TAG_FILTER_MENU_WIDTH - 8)),
			y: Math.min(bounds.bottom + 4, Math.max(8, window.innerHeight - 304))
		});
	}, []);

	useEffect(() => {
		if (!menuPosition) {
			return undefined;
		}

		const focusFirstOption = window.requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
		});
		const closeFromPointer = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				closeMenuFromEffect(false);
				return;
			}
			if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
				return;
			}
			closeMenuFromEffect(false);
		};
		const closeFromKeyboard = (event: globalThis.KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMenuFromEffect();
			}
		};

		window.addEventListener('mousedown', closeFromPointer);
		window.addEventListener('keydown', closeFromKeyboard);
		return () => {
			window.cancelAnimationFrame(focusFirstOption);
			window.removeEventListener('mousedown', closeFromPointer);
			window.removeEventListener('keydown', closeFromKeyboard);
		};
	}, [menuPosition]);

	const toggleTag = useCallback(
		(tag: string) => {
			if (!onSelectedTagsChange) {
				return;
			}
			onSelectedTagsChange(selectedTagSet.has(tag) ? selectedTags.filter((selectedTag) => selectedTag !== tag) : [...selectedTags, tag]);
		},
		[onSelectedTagsChange, selectedTagSet, selectedTags]
	);

	return (
		<>
			<div className="MainCollectionTagHeaderFilter">
				<button
					ref={buttonRef}
					type="button"
					className="MainCollectionTagHeaderFilterButton"
					aria-label={selectedTags.length > 0 ? `${selectedTags.length} tag filters active` : 'Filter Tags column'}
					aria-expanded={!!menuPosition}
					aria-haspopup="menu"
					data-active={selectedTags.length > 0}
					disabled={disabled}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						if (menuPosition) {
							closeMenu(false);
						} else {
							openMenu();
						}
					}}
				>
					<Filter size={13} aria-hidden="true" />
					<span>Tags</span>
					{activeLabel ? <span className="MainCollectionTagHeaderFilterCount">{activeLabel}</span> : null}
					<ChevronDown size={13} aria-hidden="true" />
				</button>
			</div>
			{menuPosition
				? createPortal(
						<div
							ref={menuRef}
							className="MainCollectionTagFilterMenu"
							role="menu"
							aria-label="Tags column filters"
							style={{ left: menuPosition.x, top: menuPosition.y }}
						>
							<div className="MainCollectionTagFilterMenuHeader">
								<span>Filter tags</span>
								<button
									type="button"
									className="MainCollectionTagFilterClear"
									disabled={selectedTags.length === 0}
									onClick={() => {
										onSelectedTagsChange?.([]);
									}}
								>
									<X size={13} aria-hidden="true" />
									Clear
								</button>
							</div>
							<div className="MainCollectionTagFilterList">
								{availableTags.map((tag) => (
									<label key={tag} className="MainCollectionTagFilterOption">
										<input
											type="checkbox"
											checked={selectedTagSet.has(tag)}
											onChange={() => {
												toggleTag(tag);
											}}
										/>
										<span>{tag}</span>
									</label>
								))}
							</div>
						</div>,
						document.body
					)
				: null}
		</>
	);
}

const MAIN_COLUMN_SCHEMA: ColumnSchema[] = [
	{
		title: MainColumnTitles.TYPE,
		dataIndex: 'type',
		className: 'CollectionRowModType',
		renderSetup: (props: MainCollectionSchemaProps) => {
			const { config } = props;
			const small = (config as MainCollectionConfig | undefined)?.smallRows;
			return (type: ModType) => (
				<span className="CollectionTypeIndicator">
					<ModTypeIcon type={type} size={small ? 22 : 30} className="MainCollectionIcon" />
				</span>
			);
		},
		width: getDefaultMainColumnWidth(MainColumnTitles.TYPE),
		sorter: compareModType,
		align: 'center'
	},
	{
		title: MainColumnTitles.NAME,
		dataIndex: 'name',
		className: 'CollectionRowModName',
		align: 'left',
		width: getDefaultMainColumnWidth(MainColumnTitles.NAME),
		defaultSortOrder: 'ascend',
		sorter: compareModDataDisplayName,
		renderSetup: () => {
			return (_name: string, record: DisplayModData, _rowIndex: number, context) => {
				let updateIcon = null;
				let updateTone: 'danger' | 'warning' | undefined;
				const { needsUpdate, downloadPending, downloading, hasCode } = record;
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
						title={displayName}
						onClick={(event) => {
							event.stopPropagation();
							if (context.highlighted && context.detailsOpen) {
								return;
							}
							if (context.highlighted || context.detailsOpen) {
								context.openDetails();
								return;
							}
							context.activateRow();
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
						{context.highlighted ? (
							<span className="CollectionRowDetailsHint" title="Open mod details">
								<PanelRightOpen size={14} aria-hidden="true" />
							</span>
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
					<MainCollectionTag key="size" className="MainCollectionSizeMeter" style={getSizeMeterStyle(size)} title={sizeStr}>
						<span className="MainCollectionSizeMeterLabel">{sizeStr}</span>
						<span className="MainCollectionSizeMeterTrack" aria-hidden="true">
							<span className="MainCollectionSizeMeterFill" />
						</span>
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
		headerAccessorySetup: (props: MainCollectionSchemaProps) => {
			return (
				<TagsHeaderFilter
					availableTags={props.availableTags}
					selectedTags={props.selectedTags}
					onSelectedTagsChange={props.onSelectedTagsChange}
				/>
			);
		},
		filtersSetup: (props: MainCollectionSchemaProps) => {
			return Array.from(new Set(props.rows.flatMap((record) => getAllTags(record))))
				.sort((left, right) => left.localeCompare(right))
				.map((tag) => ({ text: tag, value: tag }));
		},
		onFilter: (value, record) => {
			return getAllTags(record).includes(value.toString());
		},
		sorter: compareTagLabels,
		renderSetup: (props: MainCollectionSchemaProps) => {
			const { config } = props;
			const small = (config as MainCollectionConfig | undefined)?.smallRows;
			return (_tags: string[] | undefined, record: DisplayModData) => {
				const iconTags: CorpType[] = [];
				const actualTags: string[] = [];
				const typeTags: TypeTag[] = [];
				new Set(getAllTags(record)).forEach((tag: string) => {
					const corp = getCorpType(tag);
					const type = getTypeTag(tag);
					if (corp != null) {
						iconTags.push(corp);
					} else if (type != null) {
						typeTags.push(type);
					} else {
						actualTags.push(tag);
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

function getColumnSchema(
	props: MainCollectionSchemaProps,
	activeColumnTitles: MainColumnTitles[],
	columnWidthConfig?: Record<string, number>
): MainCollectionTableColumn[] {
	const activeColumns = activeColumnTitles.reduce<ColumnSchema[]>((columns, columnTitle) => {
		const column = mainColumnSchemaByTitle.get(columnTitle);
		if (column) {
			columns.push(column);
		}
		return columns;
	}, []);
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
			headerAccessorySetup,
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
			headerAccessory: headerAccessorySetup ? headerAccessorySetup(props) : undefined,
			align,
			render: renderSetup ? renderSetup(props) : undefined
		};
	});
}

interface MainCollectionTableColumn extends MainCollectionRowColumn, MainCollectionHeaderColumn {
	title: string;
	dataIndex: string;
	className?: string;
	align?: 'left' | 'center' | 'right';
	width?: number | string;
	resizeWidth?: number;
	sorter?: MainCollectionSorter;
	onHeaderCell?: (column: MainCollectionTableColumn) => ResizableHeaderCellProps;
}

function getHeaderCellProps(column: MainCollectionTableColumn) {
	return column.onHeaderCell?.(column);
}

function createNoopTableCommands(): MainCollectionTableCommands {
	return {
		getModDetails: () => undefined,
		setDisabled: () => undefined,
		setEnabled: () => undefined,
		setEnabledMods: () => undefined
	};
}

function getMainCollectionEmptyState(rows: DisplayModData[], visibleRows: DisplayModData[], selectedTags: string[] | undefined) {
	if (visibleRows.length > 0) {
		return undefined;
	}

	if (rows.length === 0) {
		return {
			title: 'No mods loaded',
			detail: 'Reload mods after adding local files or Workshop subscriptions.'
		};
	}

	const tagDetail =
		selectedTags && selectedTags.length > 0 ? ` ${selectedTags.length} tag filter${selectedTags.length === 1 ? '' : 's'} active.` : '';
	return {
		title: 'No mods match this view',
		detail: `Adjust search or tag filters to bring mods back into the table.${tagDetail}`
	};
}

function useMainCollectionTableController(props: CollectionViewProps) {
	const {
		collection,
		config,
		detailsOpen,
		filteredRows,
		getModDetails,
		height,
		launchingGame,
		lastValidationStatus,
		openMainViewSettingsCallback,
		rows,
		tableCommands,
		setDisabledCallback,
		setEnabledCallback,
		setEnabledModsCallback,
		setMainColumnVisibilityCallback,
		setMainColumnWidthCallback,
		setMainColumnOrderCallback,
		width
	} = props;
	const commands = useMemo<MainCollectionTableCommands>(
		() =>
			tableCommands ?? {
				...createNoopTableCommands(),
				getModDetails: getModDetails ?? (() => undefined),
				openSettings: openMainViewSettingsCallback,
				setColumnOrder: setMainColumnOrderCallback,
				setColumnVisibility: setMainColumnVisibilityCallback,
				setColumnWidth: setMainColumnWidthCallback,
				setDisabled: setDisabledCallback ?? (() => undefined),
				setEnabled: setEnabledCallback ?? (() => undefined),
				setEnabledMods: setEnabledModsCallback ?? (() => undefined)
			},
		[
			getModDetails,
			openMainViewSettingsCallback,
			setDisabledCallback,
			setEnabledCallback,
			setEnabledModsCallback,
			setMainColumnOrderCallback,
			setMainColumnVisibilityCallback,
			setMainColumnWidthCallback,
			tableCommands
		]
	);
	const mainConfig = config as MainCollectionConfig | undefined;
	const small = mainConfig?.smallRows;
	const coarsePointer = useCoarsePointer();
	const estimatedRowHeight = small && !coarsePointer ? 34 : 48;
	const columnActiveConfig = mainConfig?.columnActiveConfig;
	const columnWidthConfig = mainConfig?.columnWidthConfig;
	const deferredRows = useDeferredValue(filteredRows);
	const configuredColumnWidths = columnWidthConfig || {};
	const [{ autoColumnWidths, availableTableWidth }, dispatchMainTableMeasurement] = useReducer(mainTableMeasurementReducer, {
		autoColumnWidths: {},
		availableTableWidth: 0
	});
	const [draggingColumnTitle, setDraggingColumnTitle] = useState<MainColumnTitles>();
	const tableModel = useMemo(
		() => createMainCollectionTableModel({ config: mainConfig, autoColumnWidths, availableTableWidth }),
		[autoColumnWidths, availableTableWidth, mainConfig]
	);
	const { activeColumnTitles, hiddenColumnTitles, resolvedColumnWidths } = tableModel;
	const sampledRows = useMemo(() => deferredRows.slice(0, COLUMN_MEASUREMENT_SAMPLE_SIZE), [deferredRows]);
	const measurementInputKey = `${small ? 'compact' : 'comfortable'}::${getMeasurementRowSignature(deferredRows)}`;
	const measuredColumnTitles = useMemo(
		() => activeColumnTitles.filter((columnTitle) => AUTO_MEASURE_MAIN_COLUMN_TITLES.has(columnTitle)),
		[activeColumnTitles]
	);
	const selectedModMeasurementKey = Array.from(collection.mods)
		.sort((left, right) => left.localeCompare(right))
		.join('|');
	const measurementStateKey = `${measurementInputKey}::mods=${selectedModMeasurementKey}::validated=${lastValidationStatus ? '1' : '0'}`;
	const measurementCacheKey = useMemo(
		() => getColumnMeasurementCacheKey(measurementStateKey, measuredColumnTitles),
		[measuredColumnTitles, measurementStateKey]
	);
	const tableRootRef = useRef<HTMLDivElement | null>(null);
	const syncedColumnTitlesRef = useRef<string[]>([]);

	useEffect(() => {
		const tableRoot = tableRootRef.current;
		if (!tableRoot) {
			return;
		}

		const syncAvailableWidth = (nextWidth: number) => {
			dispatchMainTableMeasurement({ type: 'available-width-measured', width: nextWidth });
		};

		syncAvailableWidth(getMainCollectionAvailableTableWidth(tableRoot));

		if (typeof ResizeObserver === 'undefined') {
			const handleWindowResize = () => {
				syncAvailableWidth(getMainCollectionAvailableTableWidth(tableRoot));
			};
			window.addEventListener('resize', handleWindowResize);
			return () => {
				window.removeEventListener('resize', handleWindowResize);
			};
		}

		const resizeObserver = new ResizeObserver((entries) => {
			const nextWidth = getMainCollectionAvailableTableWidth(tableRoot, entries[0]?.contentRect.width);
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
			dispatchMainTableMeasurement({ type: 'auto-widths-measured', widths: nextWidths });
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
							measuredWidths[columnTitle] = Math.max(getResolvedMainColumnMinWidth(columnTitle as MainColumnTitles), measuredWidth);
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
			dispatchMainTableMeasurement({ type: 'auto-widths-measured', widths: nextMeasuredWidths });
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
			availableTags: props.availableTags ?? [],
			collection,
			config,
			getModDetails: commands.getModDetails,
			lastValidationStatus,
			onSelectedTagsChange: props.onSelectedTagsChange,
			selectedTags: props.selectedTags ?? [],
			rows
		}),
		[
			collection,
			commands.getModDetails,
			config,
			lastValidationStatus,
			props.availableTags,
			props.onSelectedTagsChange,
			props.selectedTags,
			rows
		]
	);
	const sortState = useMainCollectionTableStore((state) => state.sortState);
	const setSortState = useMainCollectionTableStore((state) => state.setSortState);
	const columns = useMemo<MainCollectionTableColumn[]>(() => {
		return getColumnSchema(columnSchemaProps, activeColumnTitles, resolvedColumnWidths).map((column) => {
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
					openMainViewSettingsCallback: commands.openSettings,
					resolvedColumnWidths,
					setDraggingColumnTitle,
					setMainColumnOrderCallback: commands.setColumnOrder,
					setMainColumnVisibilityCallback: commands.setColumnVisibility,
					setMainColumnWidthCallback: commands.setColumnWidth,
					tableRootRef
				})
			};
		}) as MainCollectionTableColumn[];
	}, [columnActiveConfig, activeColumnTitles, commands, columnSchemaProps, draggingColumnTitle, hiddenColumnTitles, resolvedColumnWidths]);
	useEffect(() => {
		const nextSortState = getMainCollectionDefaultSortState(columns, sortState);
		if (nextSortState !== sortState) {
			setSortState(nextSortState);
		}
	}, [columns, setSortState, sortState]);
	const sortedRows = useMemo(() => sortMainCollectionRows(deferredRows, columns, sortState), [columns, deferredRows, sortState]);
	const emptyState = useMemo(
		() => getMainCollectionEmptyState(rows, sortedRows, props.selectedTags),
		[props.selectedTags, rows, sortedRows]
	);
	const [highlightedRowUid, setHighlightedRowUid] = useState<string>();
	const tableContentWidth = useMemo(() => getMainCollectionTableScrollWidth(resolvedColumnWidths), [resolvedColumnWidths]);
	const tableScrollX = useMemo(() => {
		return Math.max(tableContentWidth, availableTableWidth);
	}, [availableTableWidth, tableContentWidth]);
	const needsHorizontalScroll = useMemo(() => {
		return availableTableWidth > 0 && tableContentWidth > availableTableWidth + 1;
	}, [availableTableWidth, tableContentWidth]);
	const scrollParentRef = useRef<HTMLDivElement | null>(null);
	const rowVirtualizer = useVirtualizer({
		count: sortedRows.length,
		getScrollElement: () => scrollParentRef.current,
		estimateSize: () => estimatedRowHeight,
		overscan: MAIN_COLLECTION_VIRTUAL_OVERSCAN,
		isScrollingResetDelay: VIRTUAL_SCROLLING_RESET_DELAY_MS,
		useFlushSync: false,
		initialRect: {
			height: typeof height === 'number' ? height : 640,
			width: typeof width === 'number' ? width : 1024
		}
	});
	const virtualRows = rowVirtualizer.getVirtualItems();
	const renderedVirtualRows =
		virtualRows.length > 0
			? virtualRows
			: sortedRows.slice(0, Math.min(sortedRows.length, 50)).map((_, index) => ({
					index,
					start: index * estimatedRowHeight
				}));
	const virtualBodyHeight = Math.max(rowVirtualizer.getTotalSize(), sortedRows.length * estimatedRowHeight);
	const selectionState = useMemo(() => getMainCollectionSelectionModel(collection.mods, sortedRows), [collection.mods, sortedRows]);
	const setAllVisibleSelected = useCallback(
		(selected: boolean) => {
			markPerfInteraction('collection.rowSelect.allVisible', {
				selected,
				rows: sortedRows.length
			});
			commands.setEnabledMods(selectionState.getNextCollectionMods(selected));
		},
		[commands, selectionState, sortedRows.length]
	);
	const setRowSelected = useCallback(
		(record: DisplayModData, selected: boolean) => {
			markPerfInteraction('collection.rowSelect.single', {
				selected,
				uid: record.uid
			});
			if (selected) {
				commands.setEnabled(record.uid);
			} else {
				commands.setDisabled(record.uid);
			}
		},
		[commands]
	);
	const openRowContextMenu = useCallback((record: DisplayModData) => {
		api.openModContextMenu({ uid: record.uid });
	}, []);
	const highlightRow = useCallback((record: DisplayModData) => {
		setHighlightedRowUid(record.uid);
	}, []);
	const openRowDetails = useCallback(
		(record: DisplayModData) => {
			setHighlightedRowUid(record.uid);
			commands.getModDetails(record.uid, record);
		},
		[commands]
	);
	const openHighlightedRowDetails = useCallback(() => {
		if (!highlightedRowUid) {
			return false;
		}

		const highlightedRecord = sortedRows.find((row) => row.uid === highlightedRowUid);
		if (!highlightedRecord) {
			return false;
		}

		if (!detailsOpen) {
			openRowDetails(highlightedRecord);
		}
		return true;
	}, [detailsOpen, highlightedRowUid, openRowDetails, sortedRows]);
	const navigateRowsByKeyboard = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			if (event.defaultPrevented) {
				return;
			}

			if (
				(event.key === 'Enter' || event.key === ' ') &&
				event.target === event.currentTarget &&
				event.currentTarget === scrollParentRef.current
			) {
				if (openHighlightedRowDetails()) {
					event.preventDefault();
				}
				return;
			}

			if (!isMainCollectionKeyboardNavigationTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
				return;
			}

			const highlightedIndex = highlightedRowUid ? sortedRows.findIndex((row) => row.uid === highlightedRowUid) : undefined;
			const focusedRowIndex = getMainCollectionEventRowIndex(event.currentTarget);
			const currentIndex = highlightedIndex !== undefined && highlightedIndex >= 0 ? highlightedIndex : focusedRowIndex;
			const nextIndex = getTableNavigationIndex(event.key, currentIndex, sortedRows.length);
			if (nextIndex === undefined) {
				return;
			}

			const nextRecord = sortedRows[nextIndex];
			if (!nextRecord) {
				return;
			}

			event.preventDefault();
			if (currentIndex === nextIndex) {
				scrollParentRef.current?.focus({ preventScroll: true });
				if (!detailsOpen) {
					highlightRow(nextRecord);
				}
				return;
			}
			markPerfInteraction('collection.rowKeyboardNavigate', {
				key: event.key,
				row: nextRecord.uid
			});
			rowVirtualizer.scrollToIndex(nextIndex, { align: 'auto' });
			scrollParentRef.current?.focus({ preventScroll: true });
			if (detailsOpen) {
				openRowDetails(nextRecord);
				return;
			}
			highlightRow(nextRecord);
		},
		[detailsOpen, highlightRow, highlightedRowUid, openHighlightedRowDetails, openRowDetails, rowVirtualizer, sortedRows]
	);
	const focusScrollPaneAfterRowScroll = useCallback(() => {
		const scrollParent = scrollParentRef.current;
		const activeElement = document.activeElement;
		if (!scrollParent || !(activeElement instanceof HTMLElement) || !scrollParent.contains(activeElement)) {
			return;
		}

		if (!isMainCollectionRowFocusTarget(activeElement, scrollParent)) {
			return;
		}

		scrollParent.focus({ preventScroll: true });
	}, []);
	const focusScrollPaneAfterRowScrollRef = useRef(focusScrollPaneAfterRowScroll);
	focusScrollPaneAfterRowScrollRef.current = focusScrollPaneAfterRowScroll;
	useEffect(() => {
		const scrollParent = scrollParentRef.current;
		if (!scrollParent) {
			return;
		}

		const handleScroll = () => {
			focusScrollPaneAfterRowScrollRef.current();
		};
		scrollParent.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			scrollParent.removeEventListener('scroll', handleScroll);
		};
	}, []);
	useEffect(() => {
		const scrollParent = scrollParentRef.current;
		if (!scrollParent) {
			return;
		}

		const handleScrollPaneKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.target !== scrollParent) {
				return;
			}
			navigateRowsByKeyboard(event as unknown as KeyboardEvent<HTMLElement>);
		};

		scrollParent.addEventListener('keydown', handleScrollPaneKeyDown);
		return () => {
			scrollParent.removeEventListener('keydown', handleScrollPaneKeyDown);
		};
	}, [navigateRowsByKeyboard]);

	return {
		columns,
		detailsOpen,
		height,
		highlightedRowUid,
		highlightRow,
		launchingGame,
		openRowContextMenu,
		openRowDetails,
		renderedVirtualRows,
		resolvedColumnWidths,
		scrollParentRef,
		selectionState,
		setAllVisibleSelected,
		setRowSelected,
		setSortState,
		emptyState,
		estimatedRowHeight,
		needsHorizontalScroll,
		navigateRowsByKeyboard,
		small,
		sortState,
		sortedRows,
		tableRootRef,
		tableScrollX,
		virtualBodyHeight,
		width
	};
}

function MainCollectionViewComponent(props: CollectionViewProps) {
	const {
		columns,
		detailsOpen,
		height,
		highlightedRowUid,
		highlightRow,
		launchingGame,
		openRowContextMenu,
		openRowDetails,
		renderedVirtualRows,
		resolvedColumnWidths,
		scrollParentRef,
		selectionState,
		setAllVisibleSelected,
		setRowSelected,
		setSortState,
		emptyState,
		estimatedRowHeight,
		needsHorizontalScroll,
		navigateRowsByKeyboard,
		small,
		sortState,
		sortedRows,
		tableRootRef,
		tableScrollX,
		virtualBodyHeight,
		width
	} = useMainCollectionTableController(props);

	return (
		<div
			ref={tableRootRef}
			className="MainCollectionTableRoot"
			style={{ width: width ?? '100%', height: height ?? '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
		>
			<div className={`MainCollectionVirtualShell${launchingGame ? ' is-loading' : ''}`}>
				<div
					ref={scrollParentRef}
					className={`MainCollectionVirtualScroll${needsHorizontalScroll ? ' has-horizontal-scroll' : ''}`}
					role="region"
					aria-label="Mod collection table"
					tabIndex={-1}
				>
					<table className="MainCollectionVirtualTable" style={{ width: tableScrollX }}>
						<caption className="sr-only">Mod collection table. Use column headers to sort, resize, hide, or show table columns.</caption>
						<colgroup>
							<col style={{ width: DEFAULT_SELECTION_COLUMN_WIDTH }} />
							{columns.map((column) => {
								const columnTitle = typeof column.title === 'string' ? column.title : undefined;
								const columnWidth = columnTitle ? resolvedColumnWidths[columnTitle] : undefined;
								return <col key={column.title} style={{ width: columnWidth ?? column.width ?? 120 }} />;
							})}
							<col />
						</colgroup>
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
								isColumnSortable={(column) => !!getMainCollectionSorterCompare(column.sorter)}
								onSortStateChange={setSortState}
							/>
						</thead>
						<tbody className="MainCollectionVirtualTableBody" style={{ height: virtualBodyHeight, width: tableScrollX }}>
							{renderedVirtualRows.map((virtualRow) => {
								const record = sortedRows[virtualRow.index];
								if (!record) {
									return null;
								}

								const selected = selectionState.selectedMods.has(record.uid);
								return (
									<MainCollectionVirtualRow
										key={record.uid}
										columns={columns}
										detailsOpen={detailsOpen}
										highlighted={highlightedRowUid === record.uid}
										record={record}
										rowHeight={estimatedRowHeight}
										rowIndex={virtualRow.index}
										selected={selected}
										small={small}
										start={virtualRow.start}
										tableWidth={tableScrollX}
										onContextMenu={() => {
											openRowContextMenu(record);
										}}
										onKeyDown={navigateRowsByKeyboard}
										onOpenDetails={openRowDetails}
										onRowHighlight={highlightRow}
										onSelectedChange={setRowSelected}
									/>
								);
							})}
						</tbody>
					</table>
				</div>
				{emptyState ? (
					<div
						className="absolute left-4 right-4 top-14 z-[2] rounded-sm border border-border bg-surface-alt px-4 py-3 text-ui leading-[var(--app-leading-ui)] text-text shadow-none"
						role="status"
						aria-live="polite"
					>
						<div className="font-[650]">{emptyState.title}</div>
						<div className="mt-1 text-text-muted">{emptyState.detail}</div>
					</div>
				) : null}
				{launchingGame ? <div className="MainCollectionVirtualLoading">Launching game…</div> : null}
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
