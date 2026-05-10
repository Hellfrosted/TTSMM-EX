import { ModData, ModDescriptor } from './Mod';

export enum ModErrorType {
	INVALID_ID = 3,
	MISSING_DEPENDENCIES = 4,
	INCOMPATIBLE_MODS = 5
}

export interface ModErrors {
	notSubscribed?: boolean;
	notInstalled?: boolean;
	needsUpdate?: boolean;
	invalidId?: boolean;
	unknownWorkshopDependencies?: boolean;
	missingDependencies?: ModDescriptor[];
	incompatibleMods?: string[];
}

export interface CollectionErrors {
	[id: string]: ModErrors;
}

export interface DisplayModData extends ModData {
	errors?: ModErrors;
	children?: DisplayModData[];
}
