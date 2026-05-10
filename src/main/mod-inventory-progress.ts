import log from 'electron-log';
import { ProgressTypes, ValidChannel } from '../model';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

export class ModInventoryProgress {
	private loadedMods = 0;

	localMods = 0;

	workshopMods = 0;

	constructor(private readonly progressSender: ProgressSender) {}

	addLoaded(size: number) {
		const current = this.loadedMods;
		this.loadedMods += size;
		const total = (this.localMods || 0) + (this.workshopMods || 0);
		log.silly(`Loaded ${size} new mods. Old total: ${current}, Local: ${this.localMods}, Workshop: ${this.workshopMods}`);
		this.progressSender.send(ValidChannel.PROGRESS_CHANGE, ProgressTypes.MOD_LOAD, (current + size) / total, 'Loading mod details');
	}

	finish() {
		this.progressSender.send(ValidChannel.PROGRESS_CHANGE, ProgressTypes.MOD_LOAD, 1.0, 'Finished loading mods');
	}
}
