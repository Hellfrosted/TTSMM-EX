import type { NLogLevel } from 'model/AppConfig';
import { createModManagerUid, type ModData } from 'model/Mod';

const EXTRA_PARAM_PATTERN = /"([^"]*)"|'([^']*)'|[^\s]+/g;

interface GameLaunchCommand {
	args: string[];
	workshopID: string | null;
}

export function parseExtraLaunchParams(extraParams: string): string[] {
	const matches = extraParams.matchAll(EXTRA_PARAM_PATTERN);
	return [...matches].map((match) => match[1] ?? match[2] ?? match[0]).filter((arg) => arg.length > 0);
}

export function createGameLaunchCommand(input: {
	extraParams?: string;
	logParams?: { [loggerID: string]: NLogLevel };
	modList: ModData[];
	pureVanilla?: boolean;
	workshopID: string | bigint;
}): GameLaunchCommand {
	const workshopIDText = input.workshopID.toString();
	const actualMods = input.modList
		.filter((modData) => modData && modData.workshopID !== BigInt(workshopIDText))
		.map((mod: ModData) => {
			return mod ? `[${mod.uid.toString().replaceAll(' ', ':/%20')}]` : '';
		});
	let args: string[] = [];
	let passedWorkshopID: string | null = workshopIDText;

	let addMods = true;
	if (actualMods.length === 0 || (actualMods.length === 1 && actualMods[0] === `[${createModManagerUid(input.workshopID)}]`)) {
		if (input.pureVanilla) {
			passedWorkshopID = null;
			addMods = false;
		}
	}
	if (addMods) {
		const modListStr: string = actualMods.join(',');
		args.push('+ttsmm_mod_list');
		args.push(`[${modListStr}]`);
		if (input.logParams) {
			Object.entries(input.logParams).forEach(([loggerID, logLevel]: [string, NLogLevel]) => {
				args.push(loggerID && loggerID.length > 0 ? `+log_level_${loggerID}` : '+log_level');
				args.push(logLevel);
			});
		}
	}
	if (input.extraParams) {
		args = args.concat(parseExtraLaunchParams(input.extraParams));
	}

	return {
		args,
		workshopID: passedWorkshopID
	};
}
