import { type CollectionErrors, type DisplayModData, getByUID, type ModData, type SessionMods } from 'model';

export function projectCollectionRowsWithErrors(rows: ModData[], errors: CollectionErrors | undefined): DisplayModData[] {
	return rows.map((row) => {
		const currentRow = row as DisplayModData;
		const nextErrors = errors?.[row.uid];
		if (currentRow.errors === nextErrors && (nextErrors || !('errors' in currentRow))) {
			return currentRow;
		}

		const { errors: _ignoredErrors, ...rowWithoutErrors } = currentRow;
		return nextErrors ? { ...rowWithoutErrors, errors: nextErrors } : rowWithoutErrors;
	});
}

export function getDisplayedCollectionRecord(
	session: SessionMods,
	currentRecord: ModData | undefined,
	errors?: CollectionErrors
): DisplayModData | undefined {
	if (!currentRecord) {
		return undefined;
	}

	const [displayedRecord] = projectCollectionRowsWithErrors([getByUID(session, currentRecord.uid) || currentRecord], errors);
	return displayedRecord;
}
