import { describe, expect, it } from 'vitest';

import * as collectionHandlers from '../../main/ipc/collection-handlers';

describe('collection IPC handler contract', () => {
	it('exports only IPC registration', () => {
		expect(Object.keys(collectionHandlers).sort()).toEqual(['registerCollectionHandlers']);
	});
});
