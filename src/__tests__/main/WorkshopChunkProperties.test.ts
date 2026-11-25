import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chunkWorkshopIds } from '../../main/mod-workshop-metadata';

describe('Workshop ID chunking properties', () => {
	it('preserves every ID and never exceeds the Steam page size', () => {
		fc.assert(
			fc.property(fc.array(fc.bigInt(0n, 2n ** 64n), { maxLength: 250 }), (ids) => {
				const chunks = chunkWorkshopIds(ids);
				expect(chunks.flat()).toEqual(ids);
				expect(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 50)).toBe(true);
			}),
			{ examples: [[[]], [[1n, 2n]]] }
		);
	});
});
