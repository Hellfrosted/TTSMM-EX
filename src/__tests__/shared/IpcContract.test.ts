import { describe, expect, it } from 'vitest';

import { ValidChannel } from '../../shared/ipc';

describe('shared IPC contract', () => {
	it('routes collection identity mutations through the lifecycle command channel only', () => {
		expect(ValidChannel.COLLECTION_LIFECYCLE_COMMAND).toBe('collection-lifecycle-command');
		expect(Object.values(ValidChannel)).not.toContain('create-collection');
		expect(Object.values(ValidChannel)).not.toContain('rename-collection');
		expect(Object.values(ValidChannel)).not.toContain('delete-collection');
		expect(Object.values(ValidChannel)).not.toContain('select-collection');
		expect(Object.values(ValidChannel)).not.toContain('switch-collection');
	});

	it('keeps collection content save distinct from lifecycle authority', () => {
		expect(ValidChannel.UPDATE_COLLECTION).toBe('update-collection');
		expect(ValidChannel.UPDATE_COLLECTION).not.toBe(ValidChannel.COLLECTION_LIFECYCLE_COMMAND);
	});
});
