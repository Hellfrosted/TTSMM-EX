import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	addStablePopulationEntry,
	createWorkshopPopulationRequest,
	disablePopulationEntry,
	getDisabledPopulationPath,
	readWorkshopPopulationRequests,
	restorePopulationEntry,
	scanPopulationPool
} from '../../main/population-pool';
import type { SteamUGCDetails } from '../../main/steamworks';
import Steamworks from '../../main/steamworks';

let tempDir = '';

function writeRawTech(localDir: string, fileName: string, content = '{"blocks":[]}') {
	const tacPath = path.join(localDir, 'TACtical_AI', 'Raw Techs', 'Enemies', 'eLocal');
	fs.mkdirSync(tacPath, { recursive: true });
	const filePath = path.join(tacPath, fileName);
	fs.writeFileSync(filePath, content);
	return filePath;
}

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttsmm-population-pool-'));
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(tempDir, { recursive: true, force: true });
});

function createWorkshopDetails(overrides: Partial<SteamUGCDetails>): SteamUGCDetails {
	return {
		acceptForUse: true,
		banned: false,
		tagsTruncated: false,
		fileType: 0,
		result: 1,
		visibility: 0,
		score: 0,
		file: '',
		fileName: '',
		fileSize: 0,
		previewURL: '',
		previewFile: '',
		previewFileSize: 0,
		steamIDOwner: '1',
		consumerAppID: 285920,
		creatorAppID: 285920,
		publishedFileId: 1n,
		title: 'Workshop Tech',
		description: '',
		URL: '',
		timeAddedToUserList: 0,
		timeCreated: 0,
		timeUpdated: 0,
		votesDown: 0,
		votesUp: 0,
		metadata: '',
		tags: [],
		tagsDisplayNames: ['Techs'],
		...overrides
	};
}

describe('population pool scanner', () => {
	it('scans compatible active RawTech files and skips invalid active files', async () => {
		const localDir = path.join(tempDir, 'local');
		writeRawTech(localDir, 'Scout.rawtech');
		writeRawTech(localDir, 'Empty.rawtech', '   ');
		fs.writeFileSync(path.join(path.dirname(writeRawTech(localDir, 'Readme.rawtech')), 'not-a-tech.txt'), 'ignored');

		const result = await scanPopulationPool(tempDir, { localDir });

		expect(result.rows.map((row) => [row.name, row.source, row.compatibility]).sort()).toEqual([
			['Readme', 'active', 'compatible'],
			['Scout', 'active', 'compatible']
		]);
		expect(result.pathStatuses.find((status) => status.key === 'tacLocalPopulation')?.state).toBe('manual');
	});

	it('moves active entries to disabled storage and restores them without deleting RawTech data', async () => {
		const localDir = path.join(tempDir, 'local');
		const workshopRoot = path.join(tempDir, 'workshop');
		fs.mkdirSync(workshopRoot, { recursive: true });
		const activePath = writeRawTech(localDir, 'Recoverable.rawtech');
		const activeScan = await scanPopulationPool(tempDir, { localDir });
		const activeRow = activeScan.rows.find((row) => row.path === activePath);

		const disabledResult = await disablePopulationEntry(tempDir, {
			row: activeRow!,
			localDir,
			confirmedWhileGameRunning: true,
			scanRequest: { localDir, workshopRoot }
		});
		const disabledRow = disabledResult.rows.find((row) => row.source === 'disabled');
		expect(disabledRow?.name).toBe('Recoverable');
		expect(disabledResult.pathStatuses.find((status) => status.key === 'workshopContent')?.state).toBe('manual');
		expect(fs.existsSync(path.join(getDisabledPopulationPath(path.dirname(activePath)), 'Recoverable.rawtech'))).toBe(true);

		const restoredResult = await restorePopulationEntry(tempDir, {
			row: disabledRow!,
			localDir,
			confirmedWhileGameRunning: true,
			scanRequest: { localDir, workshopRoot }
		});
		expect(restoredResult.rows.some((row) => row.source === 'active' && row.name === 'Recoverable')).toBe(true);
	});

	it('blocks file operations until the running-game write guard is confirmed', async () => {
		const localDir = path.join(tempDir, 'local');
		const activePath = writeRawTech(localDir, 'Guarded.rawtech');
		const activeScan = await scanPopulationPool(tempDir, { localDir });
		const activeRow = activeScan.rows.find((row) => row.path === activePath);

		await expect(disablePopulationEntry(tempDir, { row: activeRow!, localDir })).rejects.toThrow(
			'Population Pool writes require running-game guard confirmation.'
		);
		await expect(addStablePopulationEntry(tempDir, { row: activeRow!, localDir })).rejects.toThrow(
			'Population Pool writes require running-game guard confirmation.'
		);
	});

	it('reports blocked stable operations when the TAC Local Population Folder is missing', async () => {
		const sourcePath = path.join(tempDir, 'Candidate.rawtech');
		fs.writeFileSync(sourcePath, '{"blocks":[]}');

		await expect(
			addStablePopulationEntry(tempDir, {
				row: {
					id: 'saved:candidate',
					name: 'Candidate',
					source: 'saved-candidate',
					sourceLabel: 'Saved Tech Candidate',
					status: 'Candidate only',
					compatibility: 'compatible',
					compatibilityLabel: 'TAC-Compatible Population Entry data available',
					path: sourcePath,
					fileName: 'Candidate.rawtech',
					canStableAdd: true,
					canDisable: false,
					canRestore: false,
					canRequestWorkshopAdd: false
				},
				localDir: path.join(tempDir, 'missing-local'),
				confirmedWhileGameRunning: true
			})
		).rejects.toThrow('Missing TAC Local Population Folder.');
	});

	it('persists Workshop Population Requests outside the TAC local population folder', async () => {
		const localDir = path.join(tempDir, 'local');
		const tacPath = path.dirname(writeRawTech(localDir, 'Existing.rawtech'));

		const result = await createWorkshopPopulationRequest(tempDir, {
			row: {
				id: 'workshop:123',
				name: 'Steam Tank',
				source: 'workshop-candidate',
				sourceLabel: 'Workshop Tech Candidate',
				status: 'Workshop Tech Candidate',
				compatibility: 'candidate',
				compatibilityLabel: 'Candidate only',
				workshopId: '123',
				canStableAdd: false,
				canDisable: false,
				canRestore: false,
				canRequestWorkshopAdd: true
			},
			scanRequest: { localDir }
		});

		expect(readWorkshopPopulationRequests(tempDir)).toMatchObject([{ workshopId: '123', title: 'Steam Tank' }]);
		expect(result.pathStatuses.find((status) => status.key === 'tacLocalPopulation')?.state).toBe('manual');
		expect(fs.readdirSync(tacPath)).toEqual(['Existing.rawtech']);
	});

	it('keeps saved snapshots as candidates while enabling stable add only when RawTech data exists', async () => {
		const localDir = path.join(tempDir, 'local');
		const snapshots = path.join(localDir, 'Snapshots');
		fs.mkdirSync(path.join(snapshots, 'Plain Snapshot'), { recursive: true });
		fs.mkdirSync(path.join(snapshots, 'RawTech Snapshot'), { recursive: true });
		fs.writeFileSync(path.join(snapshots, 'RawTech Snapshot', 'Candidate.rawtech'), '{"blocks":[]}');

		const result = await scanPopulationPool(tempDir, { localDir });
		const savedRows = result.rows.filter((row) => row.source === 'saved-candidate');

		expect(savedRows.map((row) => [row.name, row.canStableAdd, row.compatibility]).sort()).toEqual([
			['Plain Snapshot', false, 'unavailable'],
			['RawTech Snapshot', true, 'compatible']
		]);
	});

	it('loads Workshop Tech Candidates from subscribed Techs and excludes Mods', async () => {
		const workshopRoot = path.join(tempDir, 'workshop');
		fs.mkdirSync(workshopRoot, { recursive: true });
		const ugcGetUserItems = vi.spyOn(Steamworks, 'ugcGetUserItems').mockImplementation((props) => {
			expect(props.options?.required_tag).toBe('Techs');
			props.success_callback({
				totalItems: 2,
				numReturned: 2,
				items: [
					createWorkshopDetails({ publishedFileId: 101n, title: 'Usable Tech', tagsDisplayNames: ['Techs', 'GSO'] }),
					createWorkshopDetails({ publishedFileId: 202n, title: 'Mod Pack', tagsDisplayNames: ['Techs', 'Mods'] })
				]
			});
		});

		const result = await scanPopulationPool(tempDir, { workshopRoot });

		expect(ugcGetUserItems).toHaveBeenCalledTimes(1);
		expect(result.rows.filter((row) => row.source === 'workshop-candidate')).toMatchObject([
			{
				name: 'Usable Tech',
				workshopId: '101',
				canRequestWorkshopAdd: true,
				compatibility: 'candidate'
			}
		]);
		expect(result.warnings).toContain('Skipped Workshop item 202 because it is tagged Mods.');
	});
});
