import { Context, Deferred, Effect, Layer, Ref } from 'effect';
import Steamworks from './steamworks';
import { ValidGreenworksChannels } from './steamworks/types';

interface SteamPersonaApi {
	getFriendPersonaName: (steamID: string) => string;
	on: (channel: ValidGreenworksChannels.PERSONA_STATE_CHANGE, callback: (steamID: string) => void) => void;
	requestUserInformation: (steamID: string, nameOnly: boolean) => boolean;
}

interface PersonaLookup {
	deferred: Deferred.Deferred<string>;
	isNew: boolean;
}

export class SteamPersonaCache extends Context.Service<
	SteamPersonaCache,
	{
		readonly resolve: (steamID: string, timeoutMs?: number) => Effect.Effect<string>;
	}
>()('ttsmm/SteamPersonaCache') {}

function tryGetPersonaName(steamworks: SteamPersonaApi, steamID: string): string | null {
	try {
		const personaName = steamworks.getFriendPersonaName(steamID);
		if (personaName && personaName.trim().length > 0 && personaName !== '[unknown]') {
			return personaName;
		}
	} catch {
		return null;
	}
	return null;
}

function createSteamPersonaCache(steamworks: SteamPersonaApi) {
	return Effect.gen(function* () {
		const pendingLookups = yield* Ref.make(new Map<string, Deferred.Deferred<string>>());
		const listeningForPersonaChanges = yield* Ref.make(false);

		const resolveLookup = (steamID: string, resolvedName: string) =>
			Ref.modify(pendingLookups, (currentLookups) => {
				const pendingLookup = currentLookups.get(steamID);
				if (!pendingLookup) {
					return [undefined, currentLookups] as const;
				}
				const nextLookups = new Map(currentLookups);
				nextLookups.delete(steamID);
				return [pendingLookup, nextLookups] as const;
			}).pipe(
				Effect.flatMap((pendingLookup) => (pendingLookup ? Deferred.succeed(pendingLookup, resolvedName).pipe(Effect.asVoid) : Effect.void))
			);

		const ensurePersonaChangeListener = Ref.modify(listeningForPersonaChanges, (isListening) => [!isListening, true] as const).pipe(
			Effect.flatMap((shouldListen) =>
				shouldListen
					? Effect.sync(() => {
							steamworks.on(ValidGreenworksChannels.PERSONA_STATE_CHANGE, (steamID: string) => {
								const resolvedName = tryGetPersonaName(steamworks, steamID) || steamID;
								Effect.runFork(resolveLookup(steamID, resolvedName));
							});
						})
					: Effect.void
			)
		);

		const resolve = Effect.fnUntraced(function* (steamID: string, timeoutMs = 5000): Effect.fn.Return<string> {
			yield* ensurePersonaChangeListener;

			const currentPersonaName = tryGetPersonaName(steamworks, steamID);
			if (currentPersonaName) {
				return currentPersonaName;
			}

			const deferred = yield* Deferred.make<string>();
			const lookup = yield* Ref.modify(
				pendingLookups,
				(currentLookups): readonly [PersonaLookup, Map<string, Deferred.Deferred<string>>] => {
					const pendingLookup = currentLookups.get(steamID);
					if (pendingLookup) {
						return [{ deferred: pendingLookup, isNew: false }, currentLookups] as const;
					}
					const nextLookups = new Map(currentLookups);
					nextLookups.set(steamID, deferred);
					return [{ deferred, isNew: true }, nextLookups] as const;
				}
			);

			if (lookup.isNew) {
				yield* Effect.sleep(`${timeoutMs} millis`).pipe(
					Effect.andThen(resolveLookup(steamID, steamID)),
					Effect.forkDetach({ startImmediately: true })
				);
				yield* Effect.sync(() => {
					try {
						const requestStarted = steamworks.requestUserInformation(steamID, true);
						if (!requestStarted) {
							Effect.runFork(resolveLookup(steamID, tryGetPersonaName(steamworks, steamID) || steamID));
						}
					} catch {
						Effect.runFork(resolveLookup(steamID, steamID));
					}
				});
			}

			return yield* Deferred.await(lookup.deferred);
		});

		return {
			resolve
		};
	});
}

export const SteamPersonaCacheLive = Layer.effect(SteamPersonaCache)(createSteamPersonaCache(Steamworks));
