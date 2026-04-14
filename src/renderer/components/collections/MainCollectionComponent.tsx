/* eslint-disable @typescript-eslint/no-explicit-any */
import { Layout, Table, Tag, Tooltip, Typography, Button } from 'antd';
import { useOutletContext } from 'react-router-dom';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Key, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, ThHTMLAttributes } from 'react';
import { ColumnType } from 'antd/lib/table';
import { CompareFn, TableRowSelection } from 'antd/lib/table/interface';
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
	label?: string;
	width?: number;
	minWidth?: number;
	onResize?: (nextWidth: number) => void;
	onResizeEnd?: (nextWidth: number) => void;
}

function ResizableHeaderCell({
	label,
	width,
	minWidth = MIN_COLUMN_WIDTH,
	onResize,
	onResizeEnd,
	children,
	style,
	...rest
}: ResizableHeaderCellProps) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const widthRef = useRef(width ?? minWidth);

	useEffect(() => {
		widthRef.current = width ?? minWidth;
	}, [minWidth, width]);

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
					aria-label={`Resize ${label || 'column'}`}
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
		defaultSortOrder: 'ascend',
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

function getColumnWidths(config: MainCollectionConfig | undefined) {
	const configuredWidths = config?.columnWidthConfig || {};
	return MAIN_COLUMN_SCHEMA.reduce(
		(acc, column) => {
			if (column.width) {
				acc[column.title] = configuredWidths[column.title] ?? column.width;
			}
			return acc;
		},
		{} as Record<string, number>
	);
}

function getColumnSchema(props: CollectionViewProps, columnWidthConfig?: Record<string, number>): ColumnType<DisplayModData>[] {
	const { config } = props;
	let activeColumns: ColumnSchema<DisplayModData>[] = MAIN_COLUMN_SCHEMA;
	const columnActiveConfig = (config as MainCollectionConfig | undefined)?.columnActiveConfig;
	if (columnActiveConfig) {
		activeColumns = activeColumns.filter((colSchema) => columnActiveConfig[colSchema.title] || columnActiveConfig[colSchema.title] === undefined);
	}
	return activeColumns.map((colSchema: ColumnSchema<DisplayModData>) => {
		const { title, dataIndex, className, width, defaultSortOrder, sorter, sorterSetup, filters, filtersSetup, onFilter, align, renderSetup } = colSchema;
		return {
			title,
			dataIndex,
			className,
			width: columnWidthConfig?.[title] ?? width,
			defaultSortOrder,
			filters: filtersSetup ? filtersSetup(props) : filters,
			onFilter,
			sorter: sorterSetup ? sorterSetup(props) : sorter,
			align,
			render: renderSetup ? renderSetup(props) : undefined
		};
	});
}

function MainCollectionViewComponent(props: CollectionViewProps) {
	const { config, filteredRows, launchingGame, width, height, setMainColumnWidthCallback } = props;
	const small = (config as MainCollectionConfig | undefined)?.smallRows;
	const deferredRows = useDeferredValue(filteredRows);
	const [resizedColumnWidths, setResizedColumnWidths] = useState<Record<string, number>>({});
	const columnWidths = useMemo(
		() => ({
			...getColumnWidths(config as MainCollectionConfig | undefined),
			...resizedColumnWidths
		}),
		[config, resizedColumnWidths]
	);

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
		return getColumnSchema(props, columnWidths).map((column) => {
			const columnTitle = typeof column.title === 'string' ? column.title : undefined;
			const currentWidth = typeof column.width === 'number' ? column.width : undefined;
			if (!columnTitle || !currentWidth) {
				return column;
			}

			return {
				...column,
				onHeaderCell: () => ({
					label: columnTitle,
					width: currentWidth,
					minWidth: MIN_COLUMN_WIDTH,
					onResize: (nextWidth: number) => {
						setResizedColumnWidths((currentWidths) => {
							if (currentWidths[columnTitle] === nextWidth) {
								return currentWidths;
							}
							return {
								...currentWidths,
								[columnTitle]: nextWidth
							};
						});
					},
					onResizeEnd: (nextWidth: number) => {
						setMainColumnWidthCallback?.(columnTitle as MainColumnTitles, nextWidth);
					}
				})
			};
		});
	}, [columnWidths, props, setMainColumnWidthCallback]);
	const handleRow = useCallback((record: DisplayModData) => {
		return {
			onContextMenu: () => {
				api.openModContextMenu(record);
			}
		};
	}, []);

	return (
		<Layout style={{ width: width ?? '100%', height: height ?? '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
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
					sticky
					scroll={{ x: 'max-content' }}
					onRow={handleRow}
					rowClassName={() => (small ? 'CompactModRow' : 'LargeModRow')}
				/>
			</Content>
		</Layout>
	);
}

export const MainCollectionView = memo(MainCollectionViewComponent);

function MainCollectionComponent() {
	const props = useOutletContext<CollectionViewProps>();
	return <MainCollectionView {...props} />;
}

export default memo(MainCollectionComponent);
