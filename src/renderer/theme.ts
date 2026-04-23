import type { CSSProperties } from 'react';
import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

export const APP_DISPLAY_FONT_FAMILY =
	`'Bahnschrift SemiCondensed', 'Aptos Display', 'Segoe UI Variable Display', 'Trebuchet MS', sans-serif`;
export const APP_FONT_FAMILY = `'Aptos', 'Segoe UI Variable Text', 'Noto Sans', 'Segoe UI', sans-serif`;
export const APP_CONTROL_HEIGHT = 44;

const APP_THEME_PALETTE = {
	clay500: '#a05442',
	clay550: '#96503f',
	clay650: '#854435',
	moss500: '#6d9c6c',
	amber500: '#c08a4f',
	rose500: '#b86159',
	rust500: '#b65b47',
	salmon500: '#c9735d',
	parchment100: '#f2ede6',
	parchment200: '#efe8df',
	parchment300: '#e8e1d7',
	canvas950: '#131517',
	canvas925: '#171a1f',
	canvas900: '#1b1f24',
	canvas875: '#171b20',
	canvas850: '#20252b',
	canvas825: '#111315',
	canvas800: '#2b323a',
	canvas790: '#222931',
	canvas780: '#191d22',
	canvas770: '#1a2026',
	canvas760: '#20262d',
	canvas750: '#242b33',
	canvas740: '#181c21',
	canvas730: '#15191d',
	black: '#000000'
} as const;

const APP_TEXT_BASE_RGB = '242, 237, 230';
const APP_BLACK_RGB = '0, 0, 0';

export const APP_THEME_COLORS = {
	primary: APP_THEME_PALETTE.clay500,
	primaryHover: APP_THEME_PALETTE.clay550,
	primaryActive: APP_THEME_PALETTE.clay650,
	success: APP_THEME_PALETTE.moss500,
	warning: APP_THEME_PALETTE.amber500,
	error: APP_THEME_PALETTE.rose500,
	info: APP_THEME_PALETTE.rust500,
	link: APP_THEME_PALETTE.salmon500,
	text: `rgba(${APP_TEXT_BASE_RGB}, 0.88)`,
	textBase: APP_THEME_PALETTE.parchment100,
	textMuted: `rgba(${APP_TEXT_BASE_RGB}, 0.66)`,
	textSubtle: `rgba(${APP_TEXT_BASE_RGB}, 0.76)`,
	tabTextMuted: `rgba(${APP_TEXT_BASE_RGB}, 0.68)`,
	background: APP_THEME_PALETTE.canvas950,
	surface: APP_THEME_PALETTE.canvas900,
	surfaceAlt: APP_THEME_PALETTE.canvas875,
	surfaceElevated: APP_THEME_PALETTE.canvas850,
	sider: APP_THEME_PALETTE.canvas825,
	footer: APP_THEME_PALETTE.canvas925,
	border: APP_THEME_PALETTE.canvas800,
	split: APP_THEME_PALETTE.canvas790,
	tableHeader: APP_THEME_PALETTE.canvas780,
	tableHeaderText: APP_THEME_PALETTE.parchment200,
	tableRowHover: APP_THEME_PALETTE.canvas770,
	tableRowSelected: APP_THEME_PALETTE.canvas760,
	tableRowSelectedHover: APP_THEME_PALETTE.canvas750,
	menuHover: APP_THEME_PALETTE.canvas740,
	fieldHover: '#965141',
	collapseBody: APP_THEME_PALETTE.canvas730,
	tagDefaultText: APP_THEME_PALETTE.parchment300,
	shadowSoft: `rgba(${APP_BLACK_RGB}, 0.22)`
} as const;

export type AppTagTone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

function createTagStyle(baseColor: string): CSSProperties {
	return {
		color: `color-mix(in srgb, ${baseColor} 70%, white)`,
		background: `color-mix(in srgb, ${baseColor} 16%, transparent)`,
		borderColor: `color-mix(in srgb, ${baseColor} 30%, transparent)`
	};
}

export const APP_TAG_STYLES: Record<AppTagTone, CSSProperties> = {
	accent: createTagStyle(APP_THEME_COLORS.primary),
	info: createTagStyle(APP_THEME_COLORS.info),
	success: createTagStyle(APP_THEME_COLORS.success),
	warning: createTagStyle(APP_THEME_COLORS.warning),
	danger: createTagStyle(APP_THEME_COLORS.error),
	neutral: {
		color: APP_THEME_COLORS.tagDefaultText,
		background: APP_THEME_COLORS.surfaceElevated,
		borderColor: APP_THEME_COLORS.border
	}
} as const;

export const appCssVariables = {
	'--app-font-body': APP_FONT_FAMILY,
	'--app-font-display': APP_DISPLAY_FONT_FAMILY,
	'--app-control-height': `${APP_CONTROL_HEIGHT}px`,
	'--app-radius-sm': '6px',
	'--app-radius-md': '8px',
	'--app-radius-lg': '10px',
	'--app-color-primary': APP_THEME_COLORS.primary,
	'--app-color-primary-hover': APP_THEME_COLORS.primaryHover,
	'--app-color-primary-active': APP_THEME_COLORS.primaryActive,
	'--app-color-success': APP_THEME_COLORS.success,
	'--app-color-warning': APP_THEME_COLORS.warning,
	'--app-color-error': APP_THEME_COLORS.error,
	'--app-color-text': APP_THEME_COLORS.text,
	'--app-color-text-base': APP_THEME_COLORS.textBase,
	'--app-color-text-muted': APP_THEME_COLORS.textMuted,
	'--app-color-background': APP_THEME_COLORS.background,
	'--app-color-surface': APP_THEME_COLORS.surface,
	'--app-color-surface-alt': APP_THEME_COLORS.surfaceAlt,
	'--app-color-surface-elevated': APP_THEME_COLORS.surfaceElevated,
	'--app-color-sider': APP_THEME_COLORS.sider,
	'--app-color-footer': APP_THEME_COLORS.footer,
	'--app-color-border': APP_THEME_COLORS.border,
	'--app-color-split': APP_THEME_COLORS.split,
	'--app-color-table-header': APP_THEME_COLORS.tableHeader,
	'--app-color-table-header-text': APP_THEME_COLORS.tableHeaderText,
	'--app-color-table-row-hover': APP_THEME_COLORS.tableRowHover,
	'--app-color-table-row-selected': APP_THEME_COLORS.tableRowSelected,
	'--app-color-table-row-selected-hover': APP_THEME_COLORS.tableRowSelectedHover
} as CSSProperties;

export const appTheme: ThemeConfig = {
	algorithm: antdTheme.darkAlgorithm,
	token: {
		fontFamily: APP_FONT_FAMILY,
		colorPrimary: APP_THEME_COLORS.primary,
		colorSuccess: APP_THEME_COLORS.success,
		colorWarning: APP_THEME_COLORS.warning,
		colorError: APP_THEME_COLORS.error,
		colorInfo: APP_THEME_COLORS.info,
		colorLink: APP_THEME_COLORS.link,
		colorTextBase: APP_THEME_COLORS.textBase,
		colorBgBase: APP_THEME_COLORS.background,
		colorBgContainer: APP_THEME_COLORS.surface,
		colorBgElevated: APP_THEME_COLORS.surfaceElevated,
		colorBorder: APP_THEME_COLORS.border,
		colorSplit: APP_THEME_COLORS.split,
		borderRadius: 8,
		borderRadiusLG: 10,
		borderRadiusSM: 6,
		controlHeight: APP_CONTROL_HEIGHT,
		boxShadowSecondary: `0 2px 8px ${APP_THEME_COLORS.shadowSoft}`
	},
	components: {
		Layout: {
			headerBg: APP_THEME_COLORS.surface,
			siderBg: APP_THEME_COLORS.sider,
			bodyBg: APP_THEME_COLORS.background,
			footerBg: APP_THEME_COLORS.footer,
			triggerBg: APP_THEME_COLORS.sider,
			triggerColor: APP_THEME_COLORS.textMuted
		},
		Menu: {
			darkItemBg: APP_THEME_COLORS.sider,
			darkSubMenuItemBg: APP_THEME_COLORS.sider,
			darkItemSelectedBg: APP_THEME_COLORS.surfaceElevated,
			darkItemHoverBg: APP_THEME_COLORS.menuHover,
			darkItemSelectedColor: APP_THEME_COLORS.textBase,
			darkItemColor: APP_THEME_COLORS.textSubtle,
			itemBorderRadius: 8,
			itemMarginInline: 10
		},
		Button: {
			borderRadius: 8,
			controlHeight: APP_CONTROL_HEIGHT,
			paddingInline: 14
		},
		Input: {
			activeBorderColor: APP_THEME_COLORS.primary,
			hoverBorderColor: APP_THEME_COLORS.fieldHover
		},
		InputNumber: {
			activeBorderColor: APP_THEME_COLORS.primary,
			hoverBorderColor: APP_THEME_COLORS.fieldHover
		},
		Select: {
			activeBorderColor: APP_THEME_COLORS.primary,
			hoverBorderColor: APP_THEME_COLORS.fieldHover
		},
		Switch: {
			colorPrimary: APP_THEME_COLORS.primary,
			colorPrimaryHover: APP_THEME_COLORS.primaryHover
		},
		Table: {
			headerBg: APP_THEME_COLORS.tableHeader,
			headerColor: APP_THEME_COLORS.tableHeaderText,
			headerBorderRadius: 0,
			rowHoverBg: APP_THEME_COLORS.tableRowHover,
			rowSelectedBg: APP_THEME_COLORS.tableRowSelected,
			rowSelectedHoverBg: APP_THEME_COLORS.tableRowSelectedHover,
			borderColor: APP_THEME_COLORS.border
		},
		Tabs: {
			itemActiveColor: APP_THEME_COLORS.textBase,
			itemColor: APP_THEME_COLORS.tabTextMuted,
			itemHoverColor: APP_THEME_COLORS.textBase,
			inkBarColor: APP_THEME_COLORS.primary
		},
		Modal: {
			contentBg: APP_THEME_COLORS.surface,
			headerBg: APP_THEME_COLORS.surface,
			titleColor: APP_THEME_COLORS.textBase
		},
		Tag: {
			borderRadiusSM: 4,
			defaultBg: APP_THEME_COLORS.surfaceElevated,
			defaultColor: APP_THEME_COLORS.tagDefaultText
		},
		Collapse: {
			headerBg: APP_THEME_COLORS.surfaceAlt,
			contentBg: APP_THEME_COLORS.collapseBody,
			borderlessContentBg: APP_THEME_COLORS.collapseBody
		},
		Descriptions: {
			labelBg: APP_THEME_COLORS.surfaceAlt
		}
	}
};
