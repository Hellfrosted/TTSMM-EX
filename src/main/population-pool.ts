import fs from 'fs';
import path from 'path';
import type {
	PopulationPoolCreateWorkshopRequest,
	PopulationPoolFileOperationRequest,
	PopulationPoolFileOperationResult,
	PopulationPoolPathKey,
	PopulationPoolPathStatus,
	PopulationPoolRow,
	PopulationPoolScanRequest,
	PopulationPoolScanResult,
	WorkshopPopulationRequest
} from 'shared/population-pool';
import { POPULATION_POOL_PATH_LABELS } from 'shared/population-pool';
import { TERRATECH_STEAM_APP_ID } from 'shared/terratech';
import { registerPreviewImage } from './preview-protocol';
import Steamworks, { type SteamPageResults, UGCMatchingType, UserUGCList, UserUGCListSortOrder } from './steamworks';

const RAWTECH_EXTENSION = '.rawtech';
const DISABLED_FOLDER_NAME = '.ttsmm-ex-disabled';
const REQUESTS_FILE = 'population-pool-workshop-requests.json';

function isDirectory(targetPath: string) {
	try {
		return fs.statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
}

function isReadableTacCompatibleRawTech(filePath: string) {
	if (path.extname(filePath).toLowerCase() !== RAWTECH_EXTENSION) {
		return false;
	}
	const content = fs.readFileSync(filePath, 'utf8');
	if (!content.trim()) {
		return false;
	}
	try {
		const parsed = JSON.parse(content) as unknown;
		return parsed !== null && (Array.isArray(parsed) || typeof parsed === 'object');
	} catch {
		return true;
	}
}

function getTacLocalPopulationPath(localDir?: string) {
	return localDir ? path.join(localDir, 'TACtical_AI', 'Raw Techs', 'Enemies', 'eLocal') : '';
}

export function getDisabledPopulationPath(tacLocalPopulationPath: string) {
	return tacLocalPopulationPath ? path.join(path.dirname(tacLocalPopulationPath), DISABLED_FOLDER_NAME) : '';
}

function getSavedTechSnapshotPath(localDir?: string) {
	return localDir ? path.join(localDir, 'Snapshots') : '';
}

function createPathStatus(
	key: PopulationPoolPathKey,
	candidatePath: string,
	missingMessage: string,
	manuallySet = false
): PopulationPoolPathStatus {
	const exists = candidatePath && isDirectory(candidatePath);
	const state = exists ? (manuallySet ? 'manual' : 'detected') : 'missing';
	return {
		key,
		label: POPULATION_POOL_PATH_LABELS[key],
		state,
		path: candidatePath,
		message: exists
			? manuallySet
				? `${POPULATION_POOL_PATH_LABELS[key]} manually set.`
				: `${POPULATION_POOL_PATH_LABELS[key]} detected.`
			: missingMessage
	};
}

export function discoverPopulationPoolPathStatuses(request: PopulationPoolScanRequest): PopulationPoolPathStatus[] {
	return [
		createPathStatus(
			'tacLocalPopulation',
			getTacLocalPopulationPath(request.localDir),
			'TAC Local Population Folder is missing. Active Population Entries and stable file operations are unavailable.',
			!!request.localDir
		),
		createPathStatus(
			'savedTechSnapshots',
			getSavedTechSnapshotPath(request.localDir),
			'Saved Tech Snapshot Folder is missing. Saved Tech Candidate discovery is unavailable.',
			!!request.localDir
		),
		createPathStatus(
			'workshopContent',
			request.workshopRoot || '',
			'Workshop Content Folder is missing. Workshop Tech Candidate discovery is unavailable.',
			!!request.workshopRoot
		)
	];
}

function getSourceLabel(source: PopulationPoolRow['source']) {
	switch (source) {
		case 'active':
			return 'Active Population Entry';
		case 'disabled':
			return 'Disabled Population Entry';
		case 'saved-candidate':
			return 'Saved Tech Candidate';
		case 'workshop-candidate':
			return 'Workshop Tech Candidate';
		case 'workshop-request':
			return 'Workshop Population Request';
	}
}

function createRawTechRow(filePath: string, source: 'active' | 'disabled'): PopulationPoolRow {
	const fileName = path.basename(filePath);
	return {
		id: `${source}:${filePath}`,
		name: path.basename(fileName, path.extname(fileName)),
		source,
		sourceLabel: getSourceLabel(source),
		status: source === 'active' ? 'TAC-spawnable from eLocal' : 'Recoverable outside eLocal',
		compatibility: 'compatible',
		compatibilityLabel: 'TAC-Compatible Population Entry',
		path: filePath,
		fileName,
		canStableAdd: false,
		canDisable: source === 'active',
		canRestore: source === 'disabled',
		canRequestWorkshopAdd: false
	};
}

function scanRawTechRows(folderPath: string, source: 'active' | 'disabled', warnings: string[]) {
	if (!isDirectory(folderPath)) {
		return [];
	}

	return fs
		.readdirSync(folderPath, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.flatMap((entry) => {
			const filePath = path.join(folderPath, entry.name);
			try {
				return isReadableTacCompatibleRawTech(filePath) ? [createRawTechRow(filePath, source)] : [];
			} catch {
				warnings.push(
					`Skipped unreadable ${source === 'active' ? 'Active Population Entry' : 'Disabled Population Entry'} file ${entry.name}.`
				);
				return [];
			}
		});
}

function scanSavedTechRows(savedPath: string, warnings: string[]) {
	if (!isDirectory(savedPath)) {
		return [];
	}
	return fs
		.readdirSync(savedPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry): PopulationPoolRow[] => {
			const snapshotPath = path.join(savedPath, entry.name);
			try {
				const previewUrl = registerPreviewImage(path.join(snapshotPath, 'Preview.png'));
				const rawTechFile = fs
					.readdirSync(snapshotPath, { withFileTypes: true })
					.find((candidate) => candidate.isFile() && path.extname(candidate.name).toLowerCase() === RAWTECH_EXTENSION);
				const rawTechPath = rawTechFile ? path.join(snapshotPath, rawTechFile.name) : undefined;
				const compatible = rawTechPath ? isReadableTacCompatibleRawTech(rawTechPath) : false;
				return [
					{
						id: `saved:${snapshotPath}`,
						name: entry.name,
						source: 'saved-candidate',
						sourceLabel: getSourceLabel('saved-candidate'),
						status: 'Candidate only',
						compatibility: compatible ? 'compatible' : 'unavailable',
						compatibilityLabel: compatible ? 'TAC-Compatible Population Entry data available' : 'Compatibility not proven',
						path: rawTechPath || snapshotPath,
						fileName: rawTechFile?.name,
						previewUrl,
						detail: 'Saved Tech Candidates are not Active Population Entries until TAC-compatible RawTech data exists.',
						canStableAdd: compatible,
						canDisable: false,
						canRestore: false,
						canRequestWorkshopAdd: false
					}
				];
			} catch {
				warnings.push(`Skipped unreadable Saved Tech Candidate folder ${entry.name}.`);
				return [];
			}
		});
}

function getRequestsPath(userDataPath: string) {
	return path.join(userDataPath, REQUESTS_FILE);
}

export function readWorkshopPopulationRequests(userDataPath: string): WorkshopPopulationRequest[] {
	try {
		const raw = JSON.parse(fs.readFileSync(getRequestsPath(userDataPath), 'utf8')) as unknown;
		if (!Array.isArray(raw)) {
			return [];
		}
		return raw.flatMap((request) => {
			if (!request || typeof request !== 'object') {
				return [];
			}
			const record = request as Record<string, unknown>;
			if (typeof record.workshopId !== 'string' || typeof record.title !== 'string' || typeof record.requestedAt !== 'string') {
				return [];
			}
			return [
				{
					workshopId: record.workshopId,
					title: record.title,
					requestedAt: record.requestedAt,
					tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : undefined
				}
			];
		});
	} catch {
		return [];
	}
}

function writeWorkshopPopulationRequests(userDataPath: string, requests: WorkshopPopulationRequest[]) {
	fs.mkdirSync(userDataPath, { recursive: true });
	fs.writeFileSync(getRequestsPath(userDataPath), JSON.stringify(requests, null, 2));
}

function createRequestRows(userDataPath: string): PopulationPoolRow[] {
	return readWorkshopPopulationRequests(userDataPath).map((request) => ({
		id: `workshop-request:${request.workshopId}`,
		name: request.title,
		source: 'workshop-request',
		sourceLabel: getSourceLabel('workshop-request'),
		status: 'Experimental Workshop Population Add requested',
		compatibility: 'candidate',
		compatibilityLabel: 'Request only, not TAC-compatible',
		workshopId: request.workshopId,
		tags: request.tags,
		detail: `Requested ${request.requestedAt}. Workshop Population Requests do not write TAC RawTech files.`,
		canStableAdd: false,
		canDisable: false,
		canRestore: false,
		canRequestWorkshopAdd: false
	}));
}

function getSubscribedTechPage(pageNum: number) {
	return new Promise<SteamPageResults>((resolve, reject) => {
		Steamworks.ugcGetUserItems({
			options: {
				app_id: Number(TERRATECH_STEAM_APP_ID),
				page_num: pageNum,
				required_tag: 'Techs'
			},
			ugc_matching_type: UGCMatchingType.ItemsReadyToUse,
			ugc_list: UserUGCList.Subscribed,
			ugc_list_sort_order: UserUGCListSortOrder.SubscriptionDateDesc,
			success_callback: resolve,
			error_callback: reject
		});
	});
}

async function scanWorkshopTechRows(warnings: string[]): Promise<PopulationPoolRow[]> {
	const details = [];
	let page = 1;
	let total = 0;
	do {
		const result = await getSubscribedTechPage(page);
		total = result.totalItems;
		details.push(...result.items);
		page += 1;
	} while (details.length < total && page < 100);

	return details
		.filter((detail) => {
			const tags = detail.tagsDisplayNames ?? [];
			const hasModsTag = tags.some((tag) => tag.toLowerCase() === 'mods');
			if (hasModsTag) {
				warnings.push(`Skipped Workshop item ${detail.publishedFileId.toString()} because it is tagged Mods.`);
			}
			return !hasModsTag;
		})
		.map(
			(detail): PopulationPoolRow => ({
				id: `workshop:${detail.publishedFileId.toString()}`,
				name: detail.title || detail.publishedFileId.toString(),
				source: 'workshop-candidate',
				sourceLabel: getSourceLabel('workshop-candidate'),
				status: 'Workshop Tech Candidate',
				compatibility: 'candidate',
				compatibilityLabel: 'Candidate only, RawTech not proven',
				workshopId: detail.publishedFileId.toString(),
				tags: detail.tagsDisplayNames,
				previewUrl: detail.previewURL,
				detail: 'Workshop Tech Candidates are not Active Population Entries until TAC-compatible RawTech data exists.',
				canStableAdd: false,
				canDisable: false,
				canRestore: false,
				canRequestWorkshopAdd: true
			})
		);
}

export async function scanPopulationPool(userDataPath: string, request: PopulationPoolScanRequest): Promise<PopulationPoolScanResult> {
	const warnings: string[] = [];
	const pathStatuses = discoverPopulationPoolPathStatuses(request);
	const tacPath = getTacLocalPopulationPath(request.localDir);
	const disabledPath = getDisabledPopulationPath(tacPath);
	const rows = [
		...scanRawTechRows(tacPath, 'active', warnings),
		...scanRawTechRows(disabledPath, 'disabled', warnings),
		...scanSavedTechRows(getSavedTechSnapshotPath(request.localDir), warnings),
		...createRequestRows(userDataPath)
	];

	if (isDirectory(request.workshopRoot || '')) {
		try {
			rows.push(...(await scanWorkshopTechRows(warnings)));
		} catch {
			warnings.push('Workshop Tech Candidate discovery is unavailable.');
		}
	}

	return { rows, pathStatuses, warnings };
}

function createUniqueDestination(folderPath: string, fileName: string) {
	const parsed = path.parse(fileName);
	const directPath = path.join(folderPath, fileName);
	if (!fs.existsSync(directPath)) {
		return directPath;
	}
	return path.join(folderPath, `${parsed.name}-${new Date().toISOString().replace(/[:.]/g, '-')}${parsed.ext}`);
}

function assertWriteGuardConfirmed(request: PopulationPoolFileOperationRequest) {
	if (!request.confirmedWhileGameRunning) {
		throw new Error('Population Pool writes require running-game guard confirmation.');
	}
}

function getPostOperationScanRequest(request: PopulationPoolFileOperationRequest): PopulationPoolScanRequest {
	return request.scanRequest ?? { localDir: request.localDir };
}

export async function disablePopulationEntry(
	userDataPath: string,
	request: PopulationPoolFileOperationRequest
): Promise<PopulationPoolFileOperationResult> {
	assertWriteGuardConfirmed(request);
	if (request.row.source !== 'active' || !request.row.path || !request.row.fileName) {
		throw new Error('Disable requires an Active Population Entry.');
	}
	const tacPath = getTacLocalPopulationPath(request.localDir);
	if (!isDirectory(tacPath)) {
		throw new Error('Missing TAC Local Population Folder.');
	}
	const disabledPath = getDisabledPopulationPath(tacPath);
	fs.mkdirSync(disabledPath, { recursive: true });
	fs.renameSync(request.row.path, createUniqueDestination(disabledPath, request.row.fileName));
	return {
		...(await scanPopulationPool(userDataPath, getPostOperationScanRequest(request))),
		operationStatus: 'Disabled Population Entry created.'
	};
}

export async function restorePopulationEntry(
	userDataPath: string,
	request: PopulationPoolFileOperationRequest
): Promise<PopulationPoolFileOperationResult> {
	assertWriteGuardConfirmed(request);
	if (request.row.source !== 'disabled' || !request.row.path || !request.row.fileName) {
		throw new Error('Restore requires a Disabled Population Entry.');
	}
	const tacPath = getTacLocalPopulationPath(request.localDir);
	if (!isDirectory(tacPath)) {
		throw new Error('Missing TAC Local Population Folder.');
	}
	fs.renameSync(request.row.path, createUniqueDestination(tacPath, request.row.fileName));
	return {
		...(await scanPopulationPool(userDataPath, getPostOperationScanRequest(request))),
		operationStatus: 'Restored Active Population Entry.'
	};
}

export async function addStablePopulationEntry(
	userDataPath: string,
	request: PopulationPoolFileOperationRequest
): Promise<PopulationPoolFileOperationResult> {
	assertWriteGuardConfirmed(request);
	if (!request.row.path || !isReadableTacCompatibleRawTech(request.row.path)) {
		throw new Error('Stable add requires TAC-Compatible Population Entry data.');
	}
	const tacPath = getTacLocalPopulationPath(request.localDir);
	if (!isDirectory(tacPath)) {
		throw new Error('Missing TAC Local Population Folder.');
	}
	const fileName = request.row.fileName || path.basename(request.row.path);
	fs.copyFileSync(request.row.path, createUniqueDestination(tacPath, fileName));
	return {
		...(await scanPopulationPool(userDataPath, getPostOperationScanRequest(request))),
		operationStatus: 'Stable Population Entry added.'
	};
}

export async function createWorkshopPopulationRequest(
	userDataPath: string,
	request: PopulationPoolCreateWorkshopRequest
): Promise<PopulationPoolScanResult> {
	if (request.row.source !== 'workshop-candidate' || !request.row.workshopId) {
		throw new Error('Workshop Population Requests require a Workshop Tech Candidate.');
	}
	const requests = readWorkshopPopulationRequests(userDataPath);
	const nextRequest: WorkshopPopulationRequest = {
		workshopId: request.row.workshopId,
		title: request.row.name,
		requestedAt: new Date().toISOString(),
		tags: request.row.tags
	};
	writeWorkshopPopulationRequests(userDataPath, [
		nextRequest,
		...requests.filter((current) => current.workshopId !== request.row.workshopId)
	]);
	return scanPopulationPool(userDataPath, request.scanRequest ?? {});
}
