import { Cause, Effect, Exit, Fiber } from 'effect';
import {
	type AppConfig,
	cloneCollection,
	cloneModData,
	hydrateSessionMods,
	type ModCollection,
	type NotificationProps,
	SessionMods,
	validateCollection
} from 'model';
import api from 'renderer/Api';
import type { CollectionWorkspaceAppState } from 'renderer/state/app-state';
import { renderValidationErrors } from './collection-validation-run';
import { type CollectionValidationRunOutcome, createCollectionWorkspaceValidationResult } from './collection-workspace-session';
import type { NotificationType } from './hooks/collections/useNotifications';

export function createCollectionValidationExecutor(input: {
	getContext: () => { config: AppConfig; mods: CollectionWorkspaceAppState['mods'] };
	openNotification: (props: NotificationProps, type?: NotificationType) => void;
}) {
	let active: { cancel: () => void } | undefined;
	const cancel = () => {
		active?.cancel();
		active = undefined;
	};
	async function validate(
		draft: ModCollection | undefined,
		launchIfValid: boolean,
		options?: { config?: AppConfig }
	): Promise<CollectionValidationRunOutcome> {
		cancel();
		if (!draft) return { type: 'missing-active-collection' };
		const context = input.getContext();
		const config = structuredClone(options?.config ?? context.config);
		const collection = cloneCollection(draft);
		const mods = hydrateSessionMods(
			new SessionMods(context.mods.localPath, context.mods.foundMods.map(cloneModData)),
			config.userOverrides,
			{ treatNuterraSteamBetaAsEquivalent: config.treatNuterraSteamBetaAsEquivalent }
		);
		const fiber = Effect.runFork(validateCollection(mods, collection));
		const current = {
			cancel: () => {
				Effect.runFork(Fiber.interrupt(fiber));
			}
		};
		active = current;
		const exit = await Effect.runPromise(Fiber.await(fiber));
		if (active !== current) return { type: 'cancelled' };
		active = undefined;
		if (Exit.isFailure(exit)) {
			if (Exit.hasInterrupts(exit)) return { type: 'cancelled' };
			api.logger.error(Cause.squash((exit as { cause: Cause.Cause<unknown> }).cause));
			input.openNotification(
				{ message: 'Collection validation did not complete. Check the mod list and try again.', placement: 'bottomLeft', duration: null },
				'error'
			);
			return { type: 'validation-run-failed' };
		}
		const rendered = renderValidationErrors(mods, exit.value, config, launchIfValid);
		const result = createCollectionWorkspaceValidationResult({
			collection,
			config,
			errors: rendered.errors,
			outcome: rendered.outcome,
			success: rendered.success || Object.keys(exit.value).length === 0,
			summary: rendered.summary
		});
		if (!result) return { type: 'discarded-stale-result' };
		return result.success
			? { type: 'recorded-current-result', validationResult: result }
			: { type: 'recorded-failed-result', validationResult: result, modalType: rendered.modalType };
	}
	return { cancel, validate };
}
