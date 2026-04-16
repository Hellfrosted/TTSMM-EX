 
export enum ModType {
	WORKSHOP = 'workshop',
	LOCAL = 'local',
	TTQMM = 'ttqmm',
	INVALID = 'invalid',
	DESCRIPTOR = 'descriptor'
}

export interface ModDescriptor {
	UIDs: Set<string>;
	modID?: string;
	workshopID?: bigint;
	name?: string;
}

export interface ModData {
	// Mod Info
	name?: string;
	authors?: string[];
	description?: string;
	uid: string;
	id: string | null;
	workshopID?: bigint;
	tags?: string[];

	// Mod properties
	lastUpdate?: Date;
	lastWorkshopUpdate?: Date;
	dateAdded?: Date;
	dateCreated?: Date;
	size?: number;
	path?: string;
	type: ModType;
	preview?: string;
	hasCode?: boolean;
	// Raw mod dependencies
	steamDependencies?: bigint[];
	steamDependencyNames?: Record<string, string>;
	explicitIDDependencies?: string[];
	// Processed descriptor dependencies
	dependsOn?: ModDescriptor[];
	isDependencyFor?: ModDescriptor[]; // Mod IDs it's dependency for. Workshop IDs if mod ID unknown

	// Mod status
	subscribed?: boolean;
	downloading?: boolean;
	downloadPending?: boolean;
	needsUpdate?: boolean;
	installed?: boolean;

	// Overrides
	overrides?: ModDataOverride;
}

export interface ModDataOverride {
	id?: string;
	tags?: string[];
}

export function getModDescriptorKey(descriptor: ModDescriptor): string | undefined {
	if (descriptor.modID) {
		return descriptor.modID;
	}
	if (descriptor.workshopID !== undefined) {
		return `${ModType.WORKSHOP}:${descriptor.workshopID.toString()}`;
	}
	return undefined;
}

export function getModDescriptorDisplayName(descriptor: ModDescriptor): string {
	if (descriptor.name) {
		return descriptor.name;
	}
	if (descriptor.modID) {
		return descriptor.modID;
	}
	if (descriptor.workshopID !== undefined) {
		return `Workshop item ${descriptor.workshopID.toString()}`;
	}
	return 'Unknown dependency';
}

export function getModDataId(record: ModData): string | null {
	if (record.overrides?.id) {
		return record.overrides.id;
	}
	return record.id;
}

export function getModDataDisplayName(record: ModData): string | undefined {
	return getModDataId(record) || record.name || undefined;
}

export function getModDataDisplayId(record: ModData): string | null {
	if (record.workshopID !== undefined) {
		return record.workshopID.toString();
	}
	return getModDataId(record);
}

export function compareModDataDisplayName(left: ModData, right: ModData): number {
	const leftName = getModDataDisplayName(left);
	const rightName = getModDataDisplayName(right);
	if (leftName) {
		if (rightName) {
			return leftName.localeCompare(rightName);
		}
		return 1;
	}
	if (rightName) {
		return -1;
	}
	return 0;
}

export function compareModDataDisplayId(left: ModData, right: ModData): number {
	if (left.workshopID !== undefined && right.workshopID !== undefined) {
		if (left.workshopID > right.workshopID) {
			return 1;
		}
		if (left.workshopID < right.workshopID) {
			return -1;
		}
		return 0;
	}

	const leftId = getModDataDisplayId(left);
	const rightId = getModDataDisplayId(right);
	if (leftId) {
		if (rightId) {
			return leftId.localeCompare(rightId);
		}
		return 1;
	}
	if (rightId) {
		return -1;
	}
	return 0;
}
