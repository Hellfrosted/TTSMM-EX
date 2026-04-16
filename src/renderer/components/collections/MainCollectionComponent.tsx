/* eslint-disable @typescript-eslint/no-explicit-any */
import { Layout, Table, Tag, Tooltip, Typography, Button } from 'antd';
import { useOutletContext } from 'react-router-dom';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, ThHTMLAttributes } from 'react';
import { ColumnType } from 'antd/lib/table';
import { CompareFn, SortOrder, TableRowSelection } from 'antd/lib/table/interface';
import api from 'renderer/Api';
import {
	CollectionViewProps,
	DisplayModData,
	MainCollectionConfig,
	MainColumnTitles,
	ModErrors,
	ModType,
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
const MIN_COLUMN_WIDTH = 80;
const KEYBOARD_RESIZE_STEP = 16;
const COLUMN_MEASUREMENT_HOST_CLASS = 'MainCollectionTableMeasureHost';
const TABLE_SORT_DIRECTIONS: SortOrder[] = ['ascend', 'descend', 'ascend'];

function getImageSrcFromType(type: ModType, size = 15) {
	switch (type) {
		case ModType.LOCAL:
			return (
				<Tooltip title="This is a local mod">
					<HddFilled style={{ fontSize: size }} />
				</Tooltip>
			);
		case ModType.TTQMM:
			return (
				<Tooltip title="This is a TTMM mod">
					<img src={ttmm} width={size} alt="" key="type" />
				</Tooltip>
			);
		case ModType.WORKSHOP:
			return (
				<Tooltip title="This is a Steam mod">
					<img src={steam} width={size} alt="" key="type" />
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
	switch (type) {
		case TypeTag.SKINS:
			return (
				<Tooltip title="Skins" key={type}>
					<img src={Icon_Skins} width={size - 14} alt="" key={type} />
				</Tooltip>
			);
		case TypeTag.BLOCKS:
			return (
				<Tooltip title="Blocks" key={type}>
					<img src={Icon_Blocks} width={size} alt="" key={type} />
				</Tooltip>
			);
		case TypeTag.CORPS:
			return (
				<Tooltip title="Custom Corps" key={type}>
					<img src={Icon_Corps} width={size - 10} alt="" key={type} />
				</Tooltip>
			);
		default:
			return null;
	}
}

function getCorpIcon(type: CorpType, size = 15) {
	switch (type) {
		case CorpType.HE:
			return (
				<Tooltip title="Hawkeye (HE)" key={type}>
					<img src={Corp_Icon_HE} width={size} alt="" key={type} />
				</Tooltip>
			);
		case CorpType.GSO:
			return (
				<Tooltip title="Galactic Survey Organization (GSO)" key={type}>
					<img src={Corp_Icon_GSO} width={size} alt="" key={type} />
				</Tooltip>
			);
		case CorpType.GC:
			return (
				<Tooltip title="GeoCorp (GC)" key={type}>
					<img src={Corp_Icon_GC} width={size} alt="" key={type} />
				</Tooltip>
			);
		case CorpType.BF:
			return (
				<Tooltip title="Better Future (BF)" key={type}>
					<img src={Corp_Icon_BF} width={size} alt="" key={type} />
				</Tooltip>
			);
		case CorpType.RR:
			return (
				<Tooltip title="Reticule Research (EXP)" key={type}>
					<img src={Corp_Icon_RR} width={size} alt="" key={type} />
				</Tooltip>
			);
		case CorpType.SPE:
			return (
				<Tooltip title="Special (SPE)" key={type}>
					<img src={Corp_Icon_SPE} width={size} alt="" key={type} />
				</Tooltip>
			);
		case CorpType.VEN:
			return (
				<Tooltip title="Venture (VEN)" key={type}>
					<img src={Corp_Icon_VEN} width={size} alt="" key={type} />
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
	filtersSetup?: (props: CollectionViewProps) => ColumnType<DisplayModData>['filters'];
	onFilter?: ColumnType<DisplayModData>['onFilter'];
	sorter?:
		| boolean
		| CompareFn<DisplayModData>
		| {
				compare?: CompareFn<DisplayModData> | undefined;
				multiple?: number | undefined;
		  }
		| undefined;
	sorterSetup?: (props: CollectionViewProps) => ColumnType<DisplayModData>['sorter'];
	renderSetup?: (props: CollectionViewProps) => (value: any, record: T, index: number) => ReactNode;
}

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
	label?: string;
	width?: number | string;
	resizeWidth?: number;
	minWidth?: number;
	onResize?: (nextWidth: number) => void;
	onResizeEnd?: (nextWidth: number) => void;
}

function ResizableHeaderCell({
	label,
	width,
	resizeWidth,
	minWidth = MIN_COLUMN_WIDTH,
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
			<div className="CollectionTableHeaderCell">{children}</div>
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

function getStateTags(props: CollectionViewProps, record: DisplayModData): StateTagConfig[] {
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

const MAIN_COLUMN_SCHEMA: ColumnSchema<DisplayModData>[] = [
	{
		title: MainColumnTitles.TYPE,
		dataIndex: 'type',
		className: 'CollectionRowModType',
		renderSetup: (props: CollectionViewProps) => {
			const { config } = props;
			const small = (config as MainCollectionConfig | undefined)?.smallRows;
			return (type: ModType) => (
				<Button type="text">
					{getImageSrcFromType(type, small ? 20 : 30)}
				</Button>
			);
		},
		width: 65,
		align: 'center'
	},
	{
		title: MainColumnTitles.NAME,
		dataIndex: 'name',
		className: 'CollectionRowModName',
		width: 320,
		defaultSortOrder: 'ascend',
		sorter: compareModDataDisplayName,
		renderSetup: (props: CollectionViewProps) => {
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
						type="submit"
						className="CollectionNameButton"
						style={{
							fontSize: 14,
							backgroundColor: 'transparent',
							borderRadius: 0,
							width: '100%',
							padding: 2,
							paddingLeft: 6,
							paddingRight: 4,
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
						{hasCode && <CodeFilled style={{ color: '#6abe39', fontSize: 16, verticalAlign: 'middle' }} />}
					</button>
				);
			};
		}
	},
	{
		title: MainColumnTitles.AUTHORS,
		dataIndex: 'authors',
		width: 180,
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
		width: 250,
		sorterSetup: (props: CollectionViewProps) => {
			return (a: DisplayModData, b: DisplayModData) => compareStateTags(getStateTags(props, a), getStateTags(props, b));
		},
		renderSetup: (props: CollectionViewProps) => {
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
		width: 170,
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
		width: 80,
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
		width: 130,
		sorter: (a, b) => compareOptionalDates(a.lastUpdate, b.lastUpdate),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.LAST_WORKSHOP_UPDATE,
		dataIndex: 'lastWorkshopUpdate',
		width: 130,
		sorter: (a, b) => compareOptionalDates(a.lastWorkshopUpdate, b.lastWorkshopUpdate),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.DATE_ADDED,
		dataIndex: 'dateAdded',
		width: 130,
		sorter: (a, b) => compareOptionalDates(a.dateAdded, b.dateAdded),
		renderSetup: () => {
			return (date: Date) => formatDateStr(date);
		}
	},
	{
		title: MainColumnTitles.TAGS,
		dataIndex: 'tags',
		className: 'CollectionRowTags',
		width: 240,
		filtersSetup: (props: CollectionViewProps) => {
			return [...new Set(props.rows.flatMap((record) => getAllTags(record)))]
				.sort((left, right) => left.localeCompare(right))
				.map((tag) => ({ text: tag, value: tag }));
		},
		onFilter: (value, record) => {
			return getAllTags(record).includes(value.toString());
		},
		renderSetup: (props: CollectionViewProps) => {
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
					...typeTags.map((type) => getTypeIcon(type, small ? 35 : 40)),
					...actualTags.map((tag) => (
						<Tag color="blue" key={tag}>
							{tag}
						</Tag>
					)),
					...iconTags.map((corp) => getCorpIcon(corp, small ? 35 : 40))
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

function getRowSelection(props: CollectionViewProps) {
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

function getColumnWidths(config: MainCollectionConfig | undefined, autoColumnWidths: Record<string, number> = {}) {
	const configuredWidths = config?.columnWidthConfig || {};
	return getActiveColumnSchemas(config).reduce(
		(acc, column) => {
			if (column.width) {
				acc[column.title] = configuredWidths[column.title] ?? autoColumnWidths[column.title] ?? column.width;
			}
			return acc;
		},
		{} as Record<string, number>
	);
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
	const leadingCellCount = Math.max(0, headerCells.length - activeColumnTitles.length);

	return activeColumnTitles.reduce(
		(acc, columnTitle, columnIndex) => {
			const renderedColumnIndex = columnIndex + leadingCellCount;
			const renderedCells: HTMLElement[] = [];
			const headerCell = headerCells[renderedColumnIndex];
			if (headerCell) {
				renderedCells.push(headerCell);
			}
			bodyRows.forEach((row) => {
				const bodyCells = Array.from(row.querySelectorAll<HTMLElement>('td'));
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

function getColumnSchema(props: CollectionViewProps, columnWidthConfig?: Record<string, number>): ColumnType<DisplayModData>[] {
	const { config } = props;
	const activeColumns = getActiveColumnSchemas(config as MainCollectionConfig | undefined);
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
	const { config, filteredRows, launchingGame, rows, width, height, setMainColumnWidthCallback } = props;
	const small = (config as MainCollectionConfig | undefined)?.smallRows;
	const deferredRows = useDeferredValue(filteredRows);
	const configuredColumnWidths = useMemo(() => (config as MainCollectionConfig | undefined)?.columnWidthConfig || {}, [config]);
	const activeColumnTitles = useMemo(
		() => getActiveColumnSchemas(config as MainCollectionConfig | undefined).map((column) => column.title),
		[config]
	);
	const [autoColumnWidths, setAutoColumnWidths] = useState<Record<string, number>>({});
	const resolvedColumnWidths = useMemo(
		() => getColumnWidths(config as MainCollectionConfig | undefined, autoColumnWidths),
		[autoColumnWidths, config]
	);
	const tableRootRef = useRef<HTMLDivElement | null>(null);
	const syncedColumnTitlesRef = useRef<string[]>([]);

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

		if (!tableRoot) {
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
						nextMeasuredWidths[columnTitle] = Math.max(MIN_COLUMN_WIDTH, measuredWidth);
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
	}, [activeColumnTitles, configuredColumnWidths, rows]);

	const rowSelection = useMemo(() => getRowSelection({ ...props, filteredRows: deferredRows }), [props, deferredRows]);
	const tableComponents = useMemo(
		() => ({
			header: {
				cell: ResizableHeaderCell
			}
		}),
		[]
	);
	const columns = useMemo(() => {
		return getColumnSchema(props, resolvedColumnWidths).map((column) => {
			const columnTitle = typeof column.title === 'string' ? column.title : undefined;
			const currentWidth = columnTitle ? resolvedColumnWidths[columnTitle] : undefined;
			if (!columnTitle || !currentWidth) {
				return column;
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
						minWidth: MIN_COLUMN_WIDTH,
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
	}, [props, resolvedColumnWidths, setMainColumnWidthCallback]);
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
						rowKey="uid"
					rowSelection={rowSelection}
					components={tableComponents}
					columns={columns}
					sortDirections={TABLE_SORT_DIRECTIONS}
					sticky
					scroll={{ x: 'max-content' }}
						onRow={handleRow}
						rowClassName={() => (small ? 'CompactModRow' : 'LargeModRow')}
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
