import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import electronPath from 'electron';
import { repoRoot } from './lib/paths';

const electronBinary = electronPath as unknown as string;
const outputPath = path.join(os.tmpdir(), 'ttsmm-steamworks-smoke-output.json');
const workerDir = path.join(repoRoot, 'scripts', '.tmp');
const workerPath = path.join(workerDir, 'ttsmm-steamworks-smoke-worker.ts');
const steamworksModulePath = path.join(repoRoot, 'src', 'main', 'steamworks', 'index.ts').replace(/\\/g, '/');
const expectedAppId = 285920;

function cleanup() {
	if (fs.existsSync(outputPath)) {
		fs.rmSync(outputPath, { force: true });
	}
	if (fs.existsSync(workerPath)) {
		fs.rmSync(workerPath, { force: true });
	}
	if (fs.existsSync(workerDir) && fs.readdirSync(workerDir).length === 0) {
		fs.rmSync(workerDir, { recursive: true, force: true });
	}
}

const workerScript = `
import fs from 'fs';
import Steamworks, { UGCMatchingType, UserUGCList, UserUGCListSortOrder } from '${steamworksModulePath}';

(async () => {
	try {
		const getSubscribedModsPage = () =>
			new Promise((resolve, reject) => {
				Steamworks.ugcGetUserItems({
					options: {
						app_id: ${expectedAppId},
						page_num: 1,
						required_tag: 'Mods'
					},
					ugc_matching_type: UGCMatchingType.ItemsReadyToUse,
					ugc_list: UserUGCList.Subscribed,
					ugc_list_sort_order: UserUGCListSortOrder.SubscriptionDateDesc,
					success_callback: resolve,
					error_callback: reject
				});
			});

		const initialized = Steamworks.init();
		const appId = Steamworks.getAppId();
		const steamId = Steamworks.getSteamId();
		const installDir = Steamworks.getAppInstallDir(appId);
		const buildId = Steamworks.getAppBuildId();
		const isAppInstalled = Steamworks.isAppInstalled(appId);
		const isSubscribedApp = Steamworks.isSubscribedApp(appId);
		const launchCommandLine = Steamworks.getLaunchCommandLine();
		const subscribedModsPage = await getSubscribedModsPage();
		const firstSubscribedItem = subscribedModsPage.items[0];
		const firstSubscribedItemId = firstSubscribedItem?.publishedFileId;
		const firstSubscribedItemState = firstSubscribedItemId ? Steamworks.ugcGetItemState(firstSubscribedItemId) : undefined;
		const firstSubscribedItemInstallInfo = firstSubscribedItemId ? Steamworks.ugcGetItemInstallInfo(firstSubscribedItemId) : undefined;

		fs.writeFileSync(
			${JSON.stringify(outputPath)},
			JSON.stringify(
				{
					initialized,
					appId,
					steamId,
					installDir,
					buildId,
					isAppInstalled,
					isSubscribedApp,
					launchCommandLine,
					subscribedItemsReturned: subscribedModsPage.numReturned,
					subscribedItemsTotal: subscribedModsPage.totalItems,
					firstSubscribedItemId: firstSubscribedItemId ? firstSubscribedItemId.toString() : undefined,
					firstSubscribedItemState,
					firstSubscribedItemInstallInfo
				},
				null,
				2
			)
		);
		process.exit(0);
	} catch (error) {
		fs.writeFileSync(
			${JSON.stringify(outputPath)},
			JSON.stringify(
				{
					error: error instanceof Error ? error.message : String(error)
				},
				null,
				2
			)
		);
		process.exit(1);
	}
})();
`;

fs.mkdirSync(workerDir, { recursive: true });
fs.writeFileSync(workerPath, workerScript);
if (fs.existsSync(outputPath)) {
	fs.rmSync(outputPath, { force: true });
}

try {
	const result = spawnSync(electronBinary, [workerPath], {
		cwd: repoRoot,
		env: {
			...process.env,
			NODE_OPTIONS: '--import=tsx'
		},
		stdio: 'pipe',
		encoding: 'utf8',
		timeout: 60000
	});

	if (result.error) {
		throw result.error;
	}

	if (!fs.existsSync(outputPath)) {
		throw new Error(`Steamworks smoke test did not produce output. stderr: ${result.stderr || '<empty>'}`);
	}

	const output = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
		error?: string;
		appId?: number;
		initialized?: boolean;
		installDir?: string;
		buildId?: number;
		isAppInstalled?: boolean;
		isSubscribedApp?: boolean;
		launchCommandLine?: string;
		subscribedItemsReturned?: number;
		subscribedItemsTotal?: number;
		firstSubscribedItemId?: string;
		firstSubscribedItemState?: number;
		firstSubscribedItemInstallInfo?: {
			folder?: string;
			sizeOnDisk?: number;
			timestamp?: number;
		};
		steamId?: unknown;
	};

	console.log(JSON.stringify(output, null, 2));

	if (result.status !== 0 || output.error) {
		throw new Error(output.error || `Steamworks smoke test failed with exit code ${result.status}`);
	}

	if (output.initialized !== true) {
		throw new Error('Steamworks smoke test did not initialize successfully.');
	}

	if (output.appId !== expectedAppId) {
		throw new Error(`Steamworks smoke test returned unexpected app ID ${output.appId}; expected ${expectedAppId}.`);
	}

	if (typeof output.installDir !== 'string' || output.installDir.length === 0 || !fs.existsSync(output.installDir)) {
		throw new Error(`Steamworks smoke test returned an invalid install directory: ${output.installDir ?? '<missing>'}`);
	}

	if (typeof output.buildId !== 'number') {
		throw new Error('Steamworks smoke test did not return a numeric app build ID.');
	}

	if (typeof output.isAppInstalled !== 'boolean' || typeof output.isSubscribedApp !== 'boolean') {
		throw new Error('Steamworks smoke test did not return boolean installation/subscription flags.');
	}

	if (typeof output.launchCommandLine !== 'string') {
		throw new Error('Steamworks smoke test did not return a string launch command line.');
	}

	if (
		typeof output.subscribedItemsReturned !== 'number' ||
		output.subscribedItemsReturned < 0 ||
		typeof output.subscribedItemsTotal !== 'number' ||
		output.subscribedItemsTotal < 0
	) {
		throw new Error('Steamworks smoke test did not return valid subscribed workshop page counts.');
	}

	if (output.firstSubscribedItemId && typeof output.firstSubscribedItemState !== 'number') {
		throw new Error('Steamworks smoke test did not return item state for the first subscribed workshop item.');
	}
} finally {
	cleanup();
}
