import { Schema } from 'effect';

const MAX_COLLECTION_MODS = 100_000;

export const collectionModsSchema = Schema.Array(Schema.String).check(
	Schema.isMaxLength(MAX_COLLECTION_MODS),
	Schema.makeFilter((mods) => new Set(mods).size === mods.length, { expected: 'an array with unique mod IDs' })
);
