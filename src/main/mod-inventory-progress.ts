import log from 'electron-log';
import { ProgressTypes, ValidChannel } from '../model';

interface ProgressSender {
	send: (channel: string, ...args: unknown[]) => void;
}

export class ModInventoryProgress {
	private loadedMods = 0;
	private lastProgress = 0;
	private finished = false;

	localMods = 0;

	workshopMods = 0;

	constructor(private readonly progressSender: ProgressSender) {}

	addLoaded(size: number) {
		if (this.finished) return;
		const current = this.loadedMods;
		this.loadedMods += size;
		const total = (this.localMods || 0) + (this.workshopMods || 0);
		this.lastProgress = Math.max(this.lastProgress, total > 0 ? Math.min(0.99, this.loadedMods / total) : 0);
		log.silly(`Loaded ${size} new mods. Old total: ${current}, Local: ${this.localMods}, Workshop: ${this.workshopMods}`);
		this.progressSender.send(ValidChannel.PROGRESS_CHANGE, ProgressTypes.MOD_LOAD, this.lastProgress, 'Loading mod details');
	}

	finish() {
		if (this.finished) return;
		this.finished = true;
		this.progressSender.send(ValidChannel.PROGRESS_CHANGE, ProgressTypes.MOD_LOAD, 1.0, 'Finished loading mods');
	}
}
