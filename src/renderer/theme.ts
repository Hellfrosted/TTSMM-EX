import type { CSSProperties } from 'react';

export const APP_FONT_FAMILY = `'Aptos', 'Segoe UI Variable Text', 'Noto Sans', 'Segoe UI', sans-serif`;
const APP_CONTROL_HEIGHT = 44;

interface AppThemePalette {
	primary: string;
	primaryText: string;
	primaryHover: string;
	primaryActive: string;
	success: string;
	warning: string;
	error: string;
	errorText: string;
	errorAction: string;
	errorActionHover: string;
	info: string;
	link: string;
	textBase: string;
	textBaseRgb: string;
	background: string;
	surface: string;
	surfaceAlt: string;
	surfaceElevated: string;
	sider: string;
	footer: string;
	border: string;
	split: string;
	tableHeader: string;
	tableHeaderText: string;
	tableRowHover: string;
	tableRowSelected: string;
	tableRowSelectedHover: string;
	menuHover: string;
	fieldHover: string;
	collapseBody: string;
	tagDefaultText: string;
	shadowRgb: string;
}

const APP_THEME_PALETTE: AppThemePalette = {
	primary: '#a05442',
	primaryText: 'oklch(73% 0.08 37)',
	primaryHover: '#96503f',
	primaryActive: '#854435',
	success: '#6d9c6c',
	warning: '#c08a4f',
	error: '#b86159',
	errorText: 'oklch(72% 0.08 25)',
	errorAction: '#873831',
	errorActionHover: '#78302b',
	info: '#b65b47',
	link: '#c9735d',
	textBase: '#f2ede6',
	textBaseRgb: '242, 237, 230',
	background: '#131517',
	surface: '#1b1f24',
	surfaceAlt: '#171b20',
	surfaceElevated: '#20252b',
	sider: '#111315',
	footer: '#171a1f',
	border: '#2b323a',
	split: '#222931',
	tableHeader: '#191d22',
	tableHeaderText: '#efe8df',
	tableRowHover: '#1a2026',
	tableRowSelected: '#20262d',
	tableRowSelectedHover: '#242b33',
	menuHover: '#181c21',
	fieldHover: '#965141',
	collapseBody: '#15191d',
	tagDefaultText: '#e8e1d7',
	shadowRgb: '0, 0, 0'
} as const;

function rgbaString(rgb: string, alpha: number) {
	return `rgba(${rgb}, ${alpha})`;
}

function createAppThemeColors(palette: AppThemePalette) {
	return {
		primary: palette.primary,
		primaryText: palette.primaryText,
		primaryHover: palette.primaryHover,
		primaryActive: palette.primaryActive,
		success: palette.success,
		warning: palette.warning,
		error: palette.error,
		errorText: palette.errorText,
		errorAction: palette.errorAction,
		errorActionHover: palette.errorActionHover,
		info: palette.info,
		link: palette.link,
		text: rgbaString(palette.textBaseRgb, 0.88),
		textBase: palette.textBase,
		textMuted: rgbaString(palette.textBaseRgb, 0.66),
		textSubtle: rgbaString(palette.textBaseRgb, 0.76),
		tabTextMuted: rgbaString(palette.textBaseRgb, 0.68),
		background: palette.background,
		surface: palette.surface,
		surfaceAlt: palette.surfaceAlt,
		surfaceElevated: palette.surfaceElevated,
		sider: palette.sider,
		footer: palette.footer,
		border: palette.border,
		split: palette.split,
		tableHeader: palette.tableHeader,
		tableHeaderText: palette.tableHeaderText,
		tableRowHover: palette.tableRowHover,
		tableRowSelected: palette.tableRowSelected,
		tableRowSelectedHover: palette.tableRowSelectedHover,
		menuHover: palette.menuHover,
		fieldHover: palette.fieldHover,
		collapseBody: palette.collapseBody,
		tagDefaultText: palette.tagDefaultText,
		shadowSoft: rgbaString(palette.shadowRgb, 0.22)
	} as const;
}

const APP_THEME_COLORS = createAppThemeColors(APP_THEME_PALETTE);

type AppTagTone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

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

function createAppCssVariables(colors: typeof APP_THEME_COLORS): CSSProperties {
	return {
		'--app-font-body': APP_FONT_FAMILY,
		'--app-font-display': APP_FONT_FAMILY,
		'--app-control-height': `${APP_CONTROL_HEIGHT}px`,
		'--app-radius-sm': '6px',
		'--app-radius-md': '8px',
		'--app-radius-lg': '10px',
		'--app-color-primary': colors.primary,
		'--app-color-primary-text': colors.primaryText,
		'--app-color-primary-hover': colors.primaryHover,
		'--app-color-primary-active': colors.primaryActive,
		'--app-color-success': colors.success,
		'--app-color-warning': colors.warning,
		'--app-color-error': colors.error,
		'--app-color-error-text': colors.errorText,
		'--app-color-error-action': colors.errorAction,
		'--app-color-error-action-hover': colors.errorActionHover,
		'--app-color-info': colors.info,
		'--app-color-link': colors.link,
		'--app-color-text': colors.text,
		'--app-color-text-base': colors.textBase,
		'--app-color-text-muted': colors.textMuted,
		'--app-color-text-subtle': colors.textSubtle,
		'--app-color-tab-text-muted': colors.tabTextMuted,
		'--app-color-background': colors.background,
		'--app-color-surface': colors.surface,
		'--app-color-surface-alt': colors.surfaceAlt,
		'--app-color-surface-elevated': colors.surfaceElevated,
		'--app-color-sider': colors.sider,
		'--app-color-footer': colors.footer,
		'--app-color-border': colors.border,
		'--app-color-split': colors.split,
		'--app-color-table-header': colors.tableHeader,
		'--app-color-table-header-text': colors.tableHeaderText,
		'--app-color-table-row-hover': colors.tableRowHover,
		'--app-color-table-row-selected': colors.tableRowSelected,
		'--app-color-table-row-selected-hover': colors.tableRowSelectedHover,
		'--app-color-menu-hover': colors.menuHover,
		'--app-color-field-hover': colors.fieldHover,
		'--app-color-collapse-body': colors.collapseBody,
		'--app-color-tag-default-text': colors.tagDefaultText,
		'--app-shadow-soft': colors.shadowSoft
	} as CSSProperties;
}

export const appCssVariables = createAppCssVariables(APP_THEME_COLORS);
