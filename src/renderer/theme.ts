import type { CSSProperties } from 'react';

export const APP_FONT_FAMILY = `'Aptos', 'Segoe UI Variable Text', 'Noto Sans', 'Segoe UI', sans-serif`;
const APP_CONTROL_HEIGHT = 44;

interface AppThemePalette {
	primary: string;
	primaryText: string;
	primaryHover: string;
	primaryActive: string;
	success: string;
	successText: string;
	warning: string;
	warningText: string;
	error: string;
	errorText: string;
	errorAction: string;
	errorActionHover: string;
	info: string;
	infoText: string;
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
	primary: 'oklch(55% 0.095 37)',
	primaryText: 'oklch(74% 0.075 37)',
	primaryHover: 'oklch(52% 0.105 37)',
	primaryActive: 'oklch(47% 0.1 37)',
	success: 'oklch(65% 0.095 146)',
	successText: 'oklch(78% 0.075 146)',
	warning: 'oklch(70% 0.105 72)',
	warningText: 'oklch(80% 0.095 72)',
	error: 'oklch(64% 0.105 28)',
	errorText: 'oklch(74% 0.085 28)',
	errorAction: 'oklch(45% 0.095 28)',
	errorActionHover: 'oklch(41% 0.09 28)',
	info: 'oklch(69% 0.075 225)',
	infoText: 'oklch(80% 0.06 225)',
	link: 'oklch(72% 0.085 37)',
	textBase: 'oklch(94% 0.012 67)',
	textBaseRgb: '242, 237, 230',
	background: 'oklch(18% 0.006 67)',
	surface: 'oklch(23% 0.008 67)',
	surfaceAlt: 'oklch(21% 0.008 67)',
	surfaceElevated: 'oklch(27% 0.01 67)',
	sider: 'oklch(16% 0.006 67)',
	footer: 'oklch(20% 0.007 67)',
	border: 'oklch(34% 0.012 67)',
	split: 'oklch(31% 0.011 67)',
	tableHeader: 'oklch(22% 0.008 67)',
	tableHeaderText: 'oklch(92% 0.013 67)',
	tableRowHover: 'oklch(24% 0.011 67)',
	tableRowSelected: 'color-mix(in oklch, oklch(55% 0.095 37) 14%, oklch(27% 0.01 67))',
	tableRowSelectedHover: 'color-mix(in oklch, oklch(55% 0.095 37) 19%, oklch(27% 0.01 67))',
	menuHover: 'oklch(23% 0.009 67)',
	fieldHover: 'color-mix(in oklch, oklch(55% 0.095 37) 42%, oklch(27% 0.01 67))',
	collapseBody: 'oklch(20% 0.009 67)',
	tagDefaultText: 'oklch(90% 0.013 67)',
	shadowRgb: '11, 12, 13'
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
		successText: palette.successText,
		successBorder: `color-mix(in oklch, ${palette.success} 44%, ${palette.border})`,
		successSurface: `color-mix(in oklch, ${palette.success} 14%, ${palette.surfaceAlt})`,
		warning: palette.warning,
		warningText: palette.warningText,
		warningBorder: `color-mix(in oklch, ${palette.warning} 40%, ${palette.border})`,
		warningSurface: `color-mix(in oklch, ${palette.warning} 16%, ${palette.surfaceAlt})`,
		error: palette.error,
		errorText: palette.errorText,
		errorAction: palette.errorAction,
		errorActionHover: palette.errorActionHover,
		errorBorder: `color-mix(in oklch, ${palette.error} 42%, ${palette.border})`,
		errorSurface: `color-mix(in oklch, ${palette.error} 17%, ${palette.surfaceAlt})`,
		info: palette.info,
		infoText: palette.infoText,
		infoBorder: `color-mix(in oklch, ${palette.info} 38%, ${palette.border})`,
		infoSurface: `color-mix(in oklch, ${palette.info} 13%, ${palette.surfaceAlt})`,
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
		shadowSoft: rgbaString(palette.shadowRgb, 0.16)
	} as const;
}

const APP_THEME_COLORS = createAppThemeColors(APP_THEME_PALETTE);

type AppTagTone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

function createTagStyle(baseColor: string): CSSProperties {
	return {
		color: `color-mix(in oklch, ${baseColor} 74%, var(--app-color-text-base))`,
		background: `color-mix(in oklch, ${baseColor} 16%, transparent)`,
		borderColor: `color-mix(in oklch, ${baseColor} 34%, transparent)`
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
		'--app-radius-sm': '4px',
		'--app-radius-md': '6px',
		'--app-radius-lg': '8px',
		'--app-motion-duration-instant': '120ms',
		'--app-motion-duration-fast': '160ms',
		'--app-motion-duration-standard': '220ms',
		'--app-motion-duration-surface': '240ms',
		'--app-motion-ease-out': 'cubic-bezier(0.25, 1, 0.5, 1)',
		'--app-motion-ease-emphasized': 'cubic-bezier(0.16, 1, 0.3, 1)',
		'--app-motion-ease-standard': 'cubic-bezier(0.22, 1, 0.36, 1)',
		'--app-color-primary': colors.primary,
		'--app-color-primary-text': colors.primaryText,
		'--app-color-primary-hover': colors.primaryHover,
		'--app-color-primary-active': colors.primaryActive,
		'--app-color-success': colors.success,
		'--app-color-success-text': colors.successText,
		'--app-color-success-border': colors.successBorder,
		'--app-color-success-surface': colors.successSurface,
		'--app-color-warning': colors.warning,
		'--app-color-warning-text': colors.warningText,
		'--app-color-warning-border': colors.warningBorder,
		'--app-color-warning-surface': colors.warningSurface,
		'--app-color-error': colors.error,
		'--app-color-error-text': colors.errorText,
		'--app-color-error-action': colors.errorAction,
		'--app-color-error-action-hover': colors.errorActionHover,
		'--app-color-error-border': colors.errorBorder,
		'--app-color-error-surface': colors.errorSurface,
		'--app-color-info': colors.info,
		'--app-color-info-text': colors.infoText,
		'--app-color-info-border': colors.infoBorder,
		'--app-color-info-surface': colors.infoSurface,
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
