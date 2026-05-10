import { shell } from 'electron';
import log from 'electron-log';

const ALLOWED_HTTPS_HOSTS = new Set([
	'discord.com',
	'forum.terratechgame.com',
	'github.com',
	'steamcommunity.com'
]);

function isAllowedSteamUrl(parsedUrl: URL): boolean {
	return parsedUrl.hostname === 'url' && /^\/CommunityFilePage\/\d+\/?$/i.test(parsedUrl.pathname);
}

export function isAllowedExternalUrl(rawUrl: string): boolean {
	try {
		const parsedUrl = new URL(rawUrl);
		if (parsedUrl.protocol === 'steam:') {
			return isAllowedSteamUrl(parsedUrl);
		}

		if (parsedUrl.protocol !== 'https:') {
			return false;
		}

		return ALLOWED_HTTPS_HOSTS.has(parsedUrl.hostname);
	} catch (error) {
		log.warn(`Rejected malformed external URL: ${rawUrl}`);
		log.warn(error);
		return false;
	}
}

export function openExternalUrl(rawUrl: string): boolean {
	if (!isAllowedExternalUrl(rawUrl)) {
		log.warn(`Blocked external URL: ${rawUrl}`);
		return false;
	}

	void shell.openExternal(rawUrl).catch((error) => {
		log.error(`Failed to open external URL: ${rawUrl}`);
		log.error(error);
	});
	return true;
}
