import { CSSProperties, ReactNode } from 'react';
import type { MainCollectionConfig, MainColumnTitles } from './MainCollectionView';
import { ModData } from './Mod';

export interface ModCollection {
	name: string;
	mods: string[];
}

export enum CollectionViewType {
	MAIN = 'main'
}

export interface CollectionViewProps {
	rows: ModData[];
	filteredRows: ModData[];
	collection: ModCollection;
	height?: number | string;
	width?: number | string;
	madeEdits?: boolean;
	lastValidationStatus?: boolean;
	launchingGame?: boolean;
	config?: MainCollectionConfig;
	setEnabledModsCallback: (mods: Set<string>) => void;
	setEnabledCallback: (mod: string) => void;
	setDisabledCallback: (mod: string) => void;
	setMainColumnWidthCallback?: (column: MainColumnTitles, width: number) => void;
	getModDetails: (mod: string, modData: ModData, bigData?: boolean) => void;
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
