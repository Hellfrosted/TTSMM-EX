import Steamworks from './steamworks';
import { ValidGreenworksChannels } from './steamworks/types';

interface PendingPersonaLookup {
	promise: Promise<string>;
	resolve: (value: string) => void;
	timeout: NodeJS.Timeout;
}

const pendingLookups = new Map<string, PendingPersonaLookup>();

let listeningForPersonaChanges = false;

function tryGetPersonaName(steamID: string): string | null {
	try {
		const personaName = Steamworks.getFriendPersonaName(steamID);
		if (personaName && personaName.trim().length > 0 && personaName !== '[unknown]') {
			return personaName;
		}
	} catch (error) {
		return null;
	}
	return null;
}

function resolveLookup(steamID: string, resolvedName: string) {
	const pendingLookup = pendingLookups.get(steamID);
	if (!pendingLookup) {
		return;
	}
	clearTimeout(pendingLookup.timeout);
	pendingLookups.delete(steamID);
	pendingLookup.resolve(resolvedName);
}

function ensurePersonaChangeListener() {
	if (listeningForPersonaChanges) {
		return;
	}
	listeningForPersonaChanges = true;
	Steamworks.on(ValidGreenworksChannels.PERSONA_STATE_CHANGE, (steamID: string) => {
		const resolvedName = tryGetPersonaName(steamID) || steamID;
		resolveLookup(steamID, resolvedName);
	});
}

export function resolvePersonaName(steamID: string, timeoutMs = 5000): Promise<string> {
	ensurePersonaChangeListener();

	const currentPersonaName = tryGetPersonaName(steamID);
	if (currentPersonaName) {
		return Promise.resolve(currentPersonaName);
	}

	const existingLookup = pendingLookups.get(steamID);
	if (existingLookup) {
		return existingLookup.promise;
	}

	let resolvePromise!: (value: string) => void;
	const promise = new Promise<string>((resolve) => {
		resolvePromise = resolve;
	});

	const timeout = setTimeout(() => {
		resolveLookup(steamID, steamID);
	}, timeoutMs);

	pendingLookups.set(steamID, {
		promise,
		resolve: resolvePromise,
		timeout
	});

	try {
		const requestStarted = Steamworks.requestUserInformation(steamID, true);
		if (!requestStarted) {
			resolveLookup(steamID, tryGetPersonaName(steamID) || steamID);
		}
	} catch (error) {
		resolveLookup(steamID, steamID);
	}

	return promise;
}
