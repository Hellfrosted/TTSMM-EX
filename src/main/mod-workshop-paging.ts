import log from 'electron-log';
import fs from 'fs';
import { Effect } from 'effect';
import { TERRATECH_STEAM_APP_ID } from 'shared/terratech';
import Steamworks, {
	type GetUserItemsProps,
	type SteamPageResults,
	UGCMatchingType,
	UserUGCList,
	UserUGCListSortOrder
} from './steamworks';

const TERRATECH_APP_ID = Number(TERRATECH_STEAM_APP_ID);

export function shouldSkipWorkshopFetch(platform: NodeJS.Platform, existsSync: typeof fs.existsSync = fs.existsSync): boolean {
	if (platform !== 'linux') {
		return false;
	}

	try {
		const installDir = Steamworks.getAppInstallDir(TERRATECH_APP_ID);
		if (Steamworks.isAppInstalled(TERRATECH_APP_ID) && installDir && existsSync(installDir)) {
			return false;
		}

		log.warn(
			`Skipping Linux workshop scan because TerraTech is not installed in the Linux Steam library. installDir=${installDir || '<missing>'}`
		);
		return true;
	} catch (error) {
		log.error('Failed to verify the Linux TerraTech installation before scanning workshop items.');
		log.error(error);
		return true;
	}
}

export const getSteamSubscribedPage = Effect.fnUntraced(function* (pageNum: number): Effect.fn.Return<SteamPageResults, Error> {
	return yield* Effect.tryPromise({
		try: () =>
			new Promise<SteamPageResults>((resolve, reject) => {
				const options: GetUserItemsProps = {
					options: {
						app_id: TERRATECH_APP_ID,
						page_num: pageNum,
						required_tag: 'Mods'
					},
					ugc_matching_type: UGCMatchingType.ItemsReadyToUse,
					ugc_list: UserUGCList.Subscribed,
					ugc_list_sort_order: UserUGCListSortOrder.SubscriptionDateDesc,
					success_callback: (results: SteamPageResults) => {
						resolve(results);
					},
					error_callback: (err: Error) => {
						reject(err);
					}
				};
				Steamworks.ugcGetUserItems(options);
			}),
		catch: (error) => (error instanceof Error ? error : new Error(String(error)))
	});
});
