import type { PopulationPoolColumnKey } from 'model';

export const POPULATION_POOL_PATH_LABELS = {
	tacLocalPopulation: 'TAC Local Population Folder',
	savedTechSnapshots: 'Saved Tech Snapshot Folder',
	workshopContent: 'Workshop Content Folder'
} as const;

export type PopulationPoolPathKey = keyof typeof POPULATION_POOL_PATH_LABELS;
export type PopulationPoolPathState = 'detected' | 'missing' | 'manual';
export type PopulationPoolSource = 'active' | 'disabled' | 'saved-candidate' | 'workshop-candidate' | 'workshop-request';
export type PopulationPoolCompatibility = 'compatible' | 'candidate' | 'incompatible' | 'unavailable';

export interface PopulationPoolPathStatus {
	key: PopulationPoolPathKey;
	label: string;
	state: PopulationPoolPathState;
	path: string;
	message: string;
}

export interface WorkshopPopulationRequest {
	workshopId: string;
	title: string;
	requestedAt: string;
	tags?: string[];
}

export interface PopulationPoolRow {
	id: string;
	name: string;
	source: PopulationPoolSource;
	sourceLabel: string;
	status: string;
	compatibility: PopulationPoolCompatibility;
	compatibilityLabel: string;
	path?: string;
	fileName?: string;
	workshopId?: string;
	tags?: string[];
	previewUrl?: string;
	detail?: string;
	canStableAdd: boolean;
	canDisable: boolean;
	canRestore: boolean;
	canRequestWorkshopAdd: boolean;
}

export interface PopulationPoolScanRequest {
	localDir?: string;
	gameExec?: string;
	workshopRoot?: string;
}

export interface PopulationPoolScanResult {
	rows: PopulationPoolRow[];
	pathStatuses: PopulationPoolPathStatus[];
	warnings: string[];
}

export interface PopulationPoolFileOperationRequest {
	row: PopulationPoolRow;
	localDir?: string;
	confirmedWhileGameRunning?: boolean;
	scanRequest?: PopulationPoolScanRequest;
}

export interface PopulationPoolFileOperationResult {
	rows: PopulationPoolRow[];
	pathStatuses: PopulationPoolPathStatus[];
	warnings: string[];
	operationStatus: string;
}

export interface PopulationPoolCreateWorkshopRequest {
	row: PopulationPoolRow;
	scanRequest?: PopulationPoolScanRequest;
}

export const POPULATION_POOL_COLUMN_TITLES: Record<PopulationPoolColumnKey, string> = {
	name: 'Name',
	source: 'Source',
	status: 'Status',
	compatibility: 'Compatibility',
	path: 'Path'
};
