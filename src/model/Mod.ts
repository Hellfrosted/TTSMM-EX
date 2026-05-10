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
	steamDependenciesFetchedAt?: number;
	explicitIDDependencies?: string[];

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

export interface ParsedModUid {
	id: string;
	type: string;
}

export function createModUid(type: ModType | string, id: string | bigint | number): string {
	return `${type}:${id.toString()}`;
}

export function parseModUid(uid: string): ParsedModUid | null {
	const separatorIndex = uid.indexOf(':');
	if (separatorIndex <= 0 || separatorIndex === uid.length - 1 || uid.indexOf(':', separatorIndex + 1) !== -1) {
		return null;
	}

	return {
		type: uid.slice(0, separatorIndex),
		id: uid.slice(separatorIndex + 1)
	};
}

export function parseWorkshopModUid(uid: string): bigint | null {
	const parsedUid = parseModUid(uid);
	if (parsedUid?.type !== ModType.WORKSHOP || !/^\d+$/.test(parsedUid.id)) {
		return null;
	}

	return BigInt(parsedUid.id);
}

interface ModDependencyKeySource {
	modID?: string;
	id?: string | null;
	workshopID?: bigint;
}

export function getModDependencyIgnoreKey(source: ModDependencyKeySource): string | undefined {
	const modID = source.modID ?? source.id ?? undefined;
	if (modID) {
		return modID;
	}
	if (source.workshopID !== undefined) {
		return createModUid(ModType.WORKSHOP, source.workshopID);
	}
	return undefined;
}

export function getModDescriptorKey(descriptor: ModDescriptor): string | undefined {
	return getModDependencyIgnoreKey(descriptor);
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

export function getModDataDependencyIgnoreKey(record: ModData): string | undefined {
	return getModDependencyIgnoreKey({
		id: getModDataId(record),
		workshopID: record.workshopID
	});
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
