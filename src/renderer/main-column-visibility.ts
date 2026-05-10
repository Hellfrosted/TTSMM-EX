import { MainColumnTitles } from 'model';

export function canSetMainColumnVisibility(columnTitle: MainColumnTitles, visible: boolean, columnActiveConfig?: Record<string, boolean>) {
	if (visible) {
		return true;
	}

	if (columnTitle === MainColumnTitles.ID && columnActiveConfig?.[MainColumnTitles.NAME] === false) {
		return false;
	}

	if (columnTitle === MainColumnTitles.NAME && columnActiveConfig?.[MainColumnTitles.ID] === false) {
		return false;
	}

	return true;
}
