import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

export const APP_FONT_FAMILY = 'Bahnschrift, Tahoma, sans-serif';

export const APP_THEME_COLORS = {
	primary: '#b65b47',
	primaryHover: '#c9735d',
	primaryActive: '#9c4d3c',
	success: '#6d9c6c',
	warning: '#c08a4f',
	error: '#b86159',
	info: '#b65b47',
	link: '#c9735d',
	textBase: '#f2ede6',
	textMuted: 'rgba(242, 237, 230, 0.72)',
	background: '#131517',
	surface: '#1b1f24',
	surfaceAlt: '#171b20',
	surfaceElevated: '#20252b',
	sider: '#111315',
	border: '#2b323a',
	split: '#222931',
	tableHeader: '#191d22',
	tableRowHover: '#1a2026',
	tableRowSelected: '#20262d',
	tableRowSelectedHover: '#242b33'
} as const;

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
		controlHeight: 34,
		boxShadowSecondary: '0 2px 8px rgba(0, 0, 0, 0.22)'
	},
	components: {
		Layout: {
			headerBg: APP_THEME_COLORS.surface,
			siderBg: APP_THEME_COLORS.sider,
			bodyBg: APP_THEME_COLORS.background,
			footerBg: '#171a1f',
			triggerBg: APP_THEME_COLORS.sider,
			triggerColor: APP_THEME_COLORS.textMuted
		},
		Menu: {
			darkItemBg: APP_THEME_COLORS.sider,
			darkSubMenuItemBg: APP_THEME_COLORS.sider,
			darkItemSelectedBg: APP_THEME_COLORS.surfaceElevated,
			darkItemHoverBg: '#181c21',
			darkItemSelectedColor: APP_THEME_COLORS.textBase,
			darkItemColor: 'rgba(242, 237, 230, 0.76)',
			itemBorderRadius: 8,
			itemMarginInline: 10
		},
		Button: {
			borderRadius: 8,
			controlHeight: 34,
			paddingInline: 14
		},
		Input: {
			activeBorderColor: APP_THEME_COLORS.primary,
			hoverBorderColor: '#965141'
		},
		InputNumber: {
			activeBorderColor: APP_THEME_COLORS.primary,
			hoverBorderColor: '#965141'
		},
		Select: {
			activeBorderColor: APP_THEME_COLORS.primary,
			hoverBorderColor: '#965141'
		},
		Switch: {
			colorPrimary: APP_THEME_COLORS.primary,
			colorPrimaryHover: APP_THEME_COLORS.primaryHover
		},
		Table: {
			headerBg: APP_THEME_COLORS.tableHeader,
			headerColor: '#efe8df',
			headerBorderRadius: 0,
			rowHoverBg: APP_THEME_COLORS.tableRowHover,
			rowSelectedBg: APP_THEME_COLORS.tableRowSelected,
			rowSelectedHoverBg: APP_THEME_COLORS.tableRowSelectedHover,
			borderColor: APP_THEME_COLORS.border
		},
		Tabs: {
			itemActiveColor: APP_THEME_COLORS.textBase,
			itemColor: 'rgba(242, 237, 230, 0.68)',
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
			defaultColor: '#e8e1d7'
		},
		Collapse: {
			headerBg: APP_THEME_COLORS.surfaceAlt,
			contentBg: '#15191d',
			borderlessContentBg: '#15191d'
		},
		Descriptions: {
			labelBg: APP_THEME_COLORS.surfaceAlt
		}
	}
};
