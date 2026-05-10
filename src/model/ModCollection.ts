import { CSSProperties, ReactNode } from 'react';
import type { MainCollectionConfig, MainColumnTitles } from './MainCollectionView';
import { ModData } from './Mod';

export interface ModCollection {
	name: string;
	mods: string[];
}

export function cloneCollection(collection: ModCollection): ModCollection {
	return {
		...collection,
		mods: [...collection.mods]
	};
}

export enum CollectionViewType {
	MAIN = 'main'
}

export interface MainCollectionTableCommands {
	getModDetails: (mod: string, modData: ModData, bigData?: boolean) => void;
	openSettings?: () => void;
	setColumnOrder?: (fromColumn: MainColumnTitles, toColumn: MainColumnTitles) => boolean | void | Promise<boolean | void>;
	setColumnVisibility?: (column: MainColumnTitles, visible: boolean) => boolean | void | Promise<boolean | void>;
	setColumnWidth?: (column: MainColumnTitles, width: number) => boolean | void | Promise<boolean | void>;
	setDisabled: (mod: string) => void;
	setEnabled: (mod: string) => void;
	setEnabledMods: (mods: Set<string>) => void;
}

export interface CollectionViewProps {
	rows: ModData[];
	filteredRows: ModData[];
	collection: ModCollection;
	height?: number | string;
	width?: number | string;
	madeEdits?: boolean;
	detailsOpen?: boolean;
	lastValidationStatus?: boolean;
	launchingGame?: boolean;
	config?: MainCollectionConfig;
	availableTags?: string[];
	selectedTags?: string[];
	tableCommands?: MainCollectionTableCommands;
	onSelectedTagsChange?: (tags: string[]) => void;
	setEnabledModsCallback?: (mods: Set<string>) => void;
	setEnabledCallback?: (mod: string) => void;
	setDisabledCallback?: (mod: string) => void;
	setMainColumnWidthCallback?: (column: MainColumnTitles, width: number) => boolean | void | Promise<boolean | void>;
	setMainColumnVisibilityCallback?: (column: MainColumnTitles, visible: boolean) => boolean | void | Promise<boolean | void>;
	setMainColumnOrderCallback?: (fromColumn: MainColumnTitles, toColumn: MainColumnTitles) => boolean | void | Promise<boolean | void>;
	openMainViewSettingsCallback?: () => void;
	getModDetails?: (mod: string, modData: ModData, bigData?: boolean) => void;
}

export enum CollectionManagerModalType {
	NONE = 0,
	DESELECTING_MOD_MANAGER = 1,
	VIEW_SETTINGS = 2,
	ERRORS_FOUND = 'errors_found',
	WARNINGS_FOUND = 'warnings_found',
	EDIT_OVERRIDES = 8,
	WARN_DELETE = 9
}

export interface NotificationProps {
	placement?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
	message: ReactNode;
	description?: ReactNode;
	btn?: ReactNode;
	className?: string;
	closeIcon?: ReactNode;
	duration: number | null;
	key?: string;
	style?: CSSProperties;
	onClick?: () => void;
	onClose?: () => void;
	top?: number;
	bottom?: number;
}
