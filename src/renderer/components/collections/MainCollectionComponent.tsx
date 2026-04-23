/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dropdown, Layout, Table, Tag, Tooltip, Typography } from 'antd';
import { useOutletContext } from 'react-router-dom';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, ThHTMLAttributes } from 'react';
import type { MenuProps } from 'antd';
import { ColumnType } from 'antd/lib/table';
import { CompareFn, SortOrder, TableRowSelection } from 'antd/lib/table/interface';
import api from 'renderer/Api';
import { APP_THEME_COLORS } from 'renderer/theme';
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
import { WarningTwoTone, ClockCircleTwoTone, StopTwoTone, HddFilled, CodeFilled } from '@ant-design/icons';
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
const COLUMN_MEASUREMENT_HOST_CLASS = 'MainCollectionTableMeasureHost';
const COLUMN_MEASUREMENT_SAMPLE_SIZE = 24;
const COLUMN_AUTO_MEASURE_MAX_ROWS = 120;
const TABLE_SORT_DIRECTIONS: SortOrder[] = ['ascend', 'descend', 'ascend'];
const ALL_MAIN_COLUMN_TITLES = Object.values(MainColumnTitles) as MainColumnTitles[];
const RESPONSIVE_COLUMN_MIN_TABLE_WIDTHS: Partial<Record<MainColumnTitles, number>> = {
	[MainColumnTitles.AUTHORS]: 760,
	[MainColumnTitles.STATE]: 860,
	[MainColumnTitles.SIZE]: 960,
	[MainColumnTitles.LAST_UPDATE]: 1080,
	[MainColumnTitles.LAST_WORKSHOP_UPDATE]: 1180,
	[MainColumnTitles.DATE_ADDED]: 1280,
	[MainColumnTitles.TAGS]: 1380
};

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

interface ColumnSchema<T> {
	title: string;
	dataIndex: string;
	className?: string;
	width?: number;
	align?: 'center';
	defaultSortOrder?: 'ascend';
	filters?: ColumnType<DisplayModData>['filters'];
	filtersSetup?: (props: MainCollectionSchemaProps) => ColumnType<DisplayModData>['filters'];
	onFilter?: ColumnType<DisplayModData>['onFilter'];
	sorter?:
		| boolean
		| CompareFn<DisplayModData>
		| {
				compare?: CompareFn<DisplayModData> | undefined;
				multiple?: number | undefined;
		  }
		| undefined;
	sorterSetup?: (props: MainCollectionSchemaProps) => ColumnType<DisplayModData>['sorter'];
	renderSetup?: (props: MainCollectionSchemaProps) => (value: any, record: T, index: number) => ReactNode;
}

type MainCollectionSchemaProps = Pick<CollectionViewProps, 'collection' | 'config' | 'getModDetails' | 'lastValidationStatus' | 'rows'>;

interface StateTagConfig {
	color?: string;
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
	const widthRef = useRef(resizeWidth ?? (typeof width === 'number' ? width : minWidth));
	const resizeLabel = label ?? (typeof rest['data-column-title'] === 'string' ? rest['data-column-title'] : 'column');

	useEffect(() => {
		widthRef.current = resizeWidth ?? (typeof width === 'number' ? width : minWidth);
	}, [minWidth, resizeWidth, width]);

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
		[minWidth, onResize, onResizeEnd]
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
			onResize?.(nextWidth);
			onResizeEnd?.(nextWidth);
		},
		[minWidth, onResize, onResizeEnd]
	);

	return (
		<th {...rest} style={{ ...(style || {}), width, position: 'relative' }}>
			{headerMenu ? (
				<Dropdown menu={headerMenu} trigger={['contextMenu']}>
					<div className="CollectionTableHeaderContextTarget">
						<div className="CollectionTableHeaderCell">{children}</div>
					</div>
				</Dropdown>
			) : (
				<div className="CollectionTableHeaderCell">{children}</div>
			)}
			{width ? (
				<button
					type="button"
					className="CollectionTableResizeHandle"
					aria-label={`Resize ${resizeLabel}`}
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
		return [{ text: 'Invalid', color: 'red', rank: 0 }];
	}

	if (!selectedMods.includes(uid)) {
		if (!subscribed && workshopID && workshopID > 0) {
			return [{ text: 'Not subscribed', rank: 4 }];
		}
		if (subscribed && !installed) {
			return [{ text: 'Not installed', rank: 5 }];
		}
		return [];
	}

	const stateTags: StateTagConfig[] = [];
	const { errors } = record;
	if (errors) {
		const { incompatibleMods, invalidId, missingDependencies, notInstalled, notSubscribed, needsUpdate } = errors;
		if (incompatibleMods && incompatibleMods.length > 0) {
			stateTags.push({ text: 'Conflicts', color: 'red', rank: 1 });
		}
		if (invalidId) {
			stateTags.push({ text: 'Invalid ID', color: 'volcano', rank: 0 });
		}
		if (missingDependencies && missingDependencies.length > 0) {
			stateTags.push({ text: 'Missing dependencies', color: 'orange', rank: 2 });
		}
		if (notSubscribed) {
			stateTags.push({ text: 'Not subscribed', color: 'yellow', rank: 4 });
		} else if (notInstalled) {
			stateTags.push({ text: 'Not installed', color: 'yellow', rank: 5 });
		} else if (needsUpdate) {
			stateTags.push({ text: 'Needs update', color: 'yellow', rank: 6 });
		}
	}

	if (stateTags.length > 0) {
		return stateTags;
	}

	if (lastValidationStatus !== undefined) {
		return [{ text: 'OK', color: 'green', rank: 7 }];
	}

	if (selectedMods.includes(uid)) {
		return [{ text: 'Pending', rank: 8 }];
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

function getMeasurementRowSignature(rows: DisplayModData[]) {
	if (rows.length === 0) {
		return 'empty';
	}

	return rows
		.slice(0, COLUMN_MEASUREMENT_SAMPLE_SIZE)
		.map((row) => row.uid)
		.sort((left, right) => left.localeCompare(right))
		.join('|');
}

const MAIN_COLUMN_SCHEMA: ColumnSchema<DisplayModData>[] = [
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
							<WarningTwoTone twoToneColor="red" />
						</Tooltip>
					);
					updateType = 'danger';
					if (downloadPending) {
						updateIcon = (
							<Tooltip title="Download pending">
								<ClockCircleTwoTone twoToneColor="orange" />
							</Tooltip>
						);
						updateType = 'warning';
					}
					if (downloading) {
						updateIcon = (
							<Tooltip title="Downloading">
								<StopTwoTone spin twoToneColor="orange" />
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
						<Tag key={tagConfig.text} color={tagConfig.color}>
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
						<Tag color="gray" key="id">
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
				if (!size || size <= 0) {
					return null;
				}

				const strNum = `${size}`;
				const power = strNum.length;
				const [digit1 = '', digit2 = '', digit3Raw = '', digit4] = strNum;
				let digit3 = digit3Raw;
				let sizeStr = '';
				if (!digit4) {
					sizeStr = `${strNum} B`;
				} else {
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
					sizeStr = value + descriptor;
				}

				let color = 'green';
				if (size > 1000000) {
					if (size < 5000000) {
						color = 'cyan';
					} else if (size < 50000000) {
						color = 'blue';
					} else if (size < 1000000000) {
						color = 'geekblue';
					} else if (size < 5000000000) {
						color = 'purple';
					} else {
						color = 'magenta';
					}
				}

				return (
					<Tag color={color} key="size">
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
						<Tag color="blue" key={tag}>
							{tag}
						</Tag>
					)),
					...iconTags.map((corp) => getCorpIcon(corp, small ? 30 : 40))
				];
			};
		}
	}
];

function getActiveColumnSchemas(config: MainCollectionConfig | undefined) {
	let activeColumns: ColumnSchema<DisplayModData>[] = MAIN_COLUMN_SCHEMA;
	const columnActiveConfig = config?.columnActiveConfig;
	if (columnActiveConfig) {
		activeColumns = activeColumns.filter((colSchema) => columnActiveConfig[colSchema.title] || columnActiveConfig[colSchema.title] === undefined);
	}
	return activeColumns;
}

function getResponsiveActiveColumnSchemas(config: MainCollectionConfig | undefined, availableTableWidth = 0) {
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
		}
	};

	return rowSelection;
}

export function getColumnWidths(config: MainCollectionConfig | undefined, autoColumnWidths: Record<string, number> = {}, availableTableWidth = 0) {
	const configuredWidths = config?.columnWidthConfig || {};
	const columnWidths = getResponsiveActiveColumnSchemas(config, availableTableWidth).reduce(
		(acc, column) => {
			if (column.width) {
				const minWidth = getMainColumnMinWidth(column.title as MainColumnTitles);
				const configuredWidth = configuredWidths[column.title] ?? autoColumnWidths[column.title] ?? column.width;
				acc[column.title] = Math.max(minWidth, configuredWidth);
			}
			return acc;
		},
		{} as Record<string, number>
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

function createColumnMeasurementHost() {
	const measurementHost = document.createElement('div');
	measurementHost.className = COLUMN_MEASUREMENT_HOST_CLASS;
	Object.assign(measurementHost.style, {
		position: 'fixed',
		left: '-100000px',
		top: '0',
		visibility: 'hidden',
		pointerEvents: 'none',
		whiteSpace: 'nowrap',
		width: 'max-content',
		maxWidth: 'none',
		overflow: 'visible',
		contain: 'layout style size'
	});
	document.body.appendChild(measurementHost);
	return measurementHost;
}

function prepareMeasurementClone(root: HTMLElement) {
	root.querySelectorAll('.CollectionTableResizeHandle').forEach((handle) => handle.remove());
	const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
	elements.forEach((element) => {
		element.style.width = element.classList.contains('CollectionNameButton') || element.style.width === '100%' ? 'auto' : element.style.width;
		element.style.minWidth = '0';
		element.style.maxWidth = 'none';
		element.style.whiteSpace = 'nowrap';
		element.style.overflow = 'visible';
		if (element === root) {
			element.style.position = 'static';
			element.style.left = 'auto';
			element.style.right = 'auto';
			element.style.top = 'auto';
			element.style.bottom = 'auto';
			element.style.transform = 'none';
			if (element.tagName === 'TH' || element.tagName === 'TD') {
				element.style.display = 'inline-block';
			}
		}
		if (element.classList.contains('CollectionNameButton')) {
			element.style.display = 'inline-block';
		}
	});
}

function measureNaturalCellWidth(cell: HTMLElement, measurementHost: HTMLElement) {
	const clone = cell.cloneNode(true) as HTMLElement;
	prepareMeasurementClone(clone);
	measurementHost.appendChild(clone);
	const width = Math.ceil(clone.getBoundingClientRect().width);
	measurementHost.removeChild(clone);
	return width;
}

function getRenderedColumnCells(tableRoot: HTMLElement, activeColumnTitles: string[]) {
	const headerRow = tableRoot.querySelector<HTMLElement>('.ant-table-header thead tr:last-child');
	const headerCells = headerRow ? Array.from(headerRow.children).filter((element): element is HTMLElement => element instanceof HTMLElement) : [];
	const body = tableRoot.querySelector<HTMLElement>('.ant-table-tbody');
	const bodyRows = body ? Array.from(body.children).filter((element): element is HTMLElement => element instanceof HTMLElement) : [];
	const sampledBodyRows = bodyRows.slice(0, COLUMN_MEASUREMENT_SAMPLE_SIZE);
	const sampledBodyCells = sampledBodyRows.map((row) => Array.from(row.querySelectorAll<HTMLElement>('td')));
	const leadingCellCount = Math.max(0, headerCells.length - activeColumnTitles.length);

	return activeColumnTitles.reduce(
		(acc, columnTitle, columnIndex) => {
			const renderedColumnIndex = columnIndex + leadingCellCount;
			const renderedCells: HTMLElement[] = [];
			const headerCell = headerCells[renderedColumnIndex];
			if (headerCell) {
				renderedCells.push(headerCell);
			}
			sampledBodyCells.forEach((bodyCells) => {
				const bodyCell = bodyCells[renderedColumnIndex];
				if (bodyCell) {
					renderedCells.push(bodyCell);
				}
			});
			acc[columnTitle] = renderedCells;
			return acc;
		},
		{} as Record<string, HTMLElement[]>
	);
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
	return activeColumns.map((colSchema: ColumnSchema<DisplayModData>) => {
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
	const measurementInputKey = useMemo(
		() => `${small ? 'compact' : 'comfortable'}::${getMeasurementRowSignature(deferredRows)}`,
		[deferredRows, small]
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
		const missingColumnTitles = activeColumnTitles.filter((columnTitle) => configuredColumnWidths[columnTitle] === undefined);
		const shouldAutoMeasureColumns = deferredRows.length > 0 && deferredRows.length <= COLUMN_AUTO_MEASURE_MAX_ROWS;

		if (!tableRoot) {
			return;
		}

		if (!shouldAutoMeasureColumns) {
			setAutoColumnWidths((currentWidths) => (Object.keys(currentWidths).length === 0 ? currentWidths : {}));
			return;
		}

		if (missingColumnTitles.length === 0) {
			setAutoColumnWidths((currentWidths) => (Object.keys(currentWidths).length === 0 ? currentWidths : {}));
			return;
		}

		const animationFrame = window.requestAnimationFrame(() => {
			const measurementHost = createColumnMeasurementHost();

			try {
				const renderedColumnCells = getRenderedColumnCells(tableRoot, activeColumnTitles);
				const nextMeasuredWidths: Record<string, number> = {};

				missingColumnTitles.forEach((columnTitle) => {
					const matchingCells = renderedColumnCells[columnTitle] || [];
					const measuredWidth = matchingCells.reduce((largestWidth, cell) => {
						return Math.max(largestWidth, measureNaturalCellWidth(cell, measurementHost));
					}, 0);

					if (measuredWidth > 0) {
						nextMeasuredWidths[columnTitle] = Math.max(getMainColumnMinWidth(columnTitle as MainColumnTitles), measuredWidth);
					}
				});

				setAutoColumnWidths((currentWidths) => {
					const nextWidths: Record<string, number> = {};
					let changed = false;

					missingColumnTitles.forEach((columnTitle) => {
						const nextWidth = nextMeasuredWidths[columnTitle] ?? currentWidths[columnTitle];
						if (nextWidth !== undefined) {
							nextWidths[columnTitle] = nextWidth;
							if (currentWidths[columnTitle] !== nextWidth) {
								changed = true;
							}
						}
					});

					if (!changed && Object.keys(currentWidths).length === Object.keys(nextWidths).length) {
						return currentWidths;
					}

					return nextWidths;
				});
			} finally {
				measurementHost.remove();
			}
		});

		return () => {
			window.cancelAnimationFrame(animationFrame);
		};
	}, [activeColumnTitles, configuredColumnWidths, deferredRows.length, measurementInputKey]);

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
					}) as any,
				onCell: () =>
					({
						'data-column-title': columnTitle
					}) as any
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
						scroll={{ x: 'max-content' }}
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
