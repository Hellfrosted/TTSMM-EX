import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createModManagerUid, createModUid, parseModUid, parseWorkshopModUid } from '../../model/Mod';

describe('mod UID properties', () => {
	it('round-trips a type and id through createModUid and parseModUid', () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,16}$/), fc.stringMatching(/^[A-Za-z0-9_-]{1,24}$/), (type, id) => {
				expect(parseModUid(createModUid(type, id))).toEqual({ type, id });
			})
		);
	});

	it('round-trips a Workshop id through the manager UID helpers', () => {
		fc.assert(
			fc.property(fc.bigInt(0n, 2n ** 64n), (workshopID) => {
				expect(parseWorkshopModUid(createModManagerUid(workshopID))).toBe(workshopID);
			})
		);
	});

	it('rejects UIDs with a missing or duplicated separator', () => {
		fc.assert(
			fc.property(fc.stringMatching(/^[A-Za-z0-9_-]{1,16}$/), (text) => {
				expect(parseModUid(`${text}`)).toBeNull();
				expect(parseModUid(`${text}::id`)).toBeNull();
			})
		);
	});
});
