# T020 Rendered Preview Owner Design

## Scope

This pass covers the deferred Rendered Block Previews ownership questions:

- block-to-preview matching across TypeScript indexing and the Rust sidecar
- stale rendered-preview cache pruning after successful index builds

It is read-only design scope for implementation. No Worker should change native extraction, cache deletion, persisted index shape, or preview availability until this owner split is accepted.

## Current Ownership Map

### Rendered Preview Matching

The current matching rule is split across three Modules:

- `src/main/block-lookup-rendered-preview-assignment.ts` owns record-to-preview scoring, token normalization, variant conflict checks, Blockpedia preference, and conversion to the persisted `renderedPreview` value.
- `native/block-lookup-extractor/src/main.rs` owns Unity asset enumeration, Texture2D decoding, mesh rendering, flat-image rejection, cache file writing, and also builds preview match keys from TextAsset JSON plus optional request names.
- `src/main/block-lookup-index-build.ts` owns the same-mod JSON record pass that asks bundle sources for preview assets after source records have already been indexed.

The duplicate-owner risk is the matching policy, not the act of filtering work. The Rust sidecar currently knows enough about TerraTech block metadata to decide which Unity assets are worth extracting. TypeScript then repeats the semantic match to decide which block receives the asset.

### Cache Pruning

The current cache rule is not implemented. Cache writes happen from:

- `native/block-lookup-extractor/src/main.rs` for bundle and mesh thumbnails.
- `src/main/block-lookup-blockpedia-previews.ts` for official vanilla Blockpedia thumbnails and its manifest.

The only Module with enough context to prune safely is the main Block Lookup index boundary after a successful write:

- `src/main/block-lookup.ts` has `userDataPath`, the final successful index, and the preview cache directory.
- `src/main/block-lookup-index-build.ts` produces the final `records` and `sourceRecords`, but it should not delete files because it is still a build-planning/index construction Module.

There is also contract drift: ADR-0007 says Block Lookup records persist cache-relative thumbnail references, but `src/main/block-lookup-rendered-preview-assignment.ts` currently persists `image://block-preview/...` URLs. Cache pruning should not parse protocol URLs to recover cache paths.

## Owner Decisions

### Decision 1: TypeScript Owns Block-to-Preview Matching

Winning owner: `src/main/block-lookup-rendered-preview-assignment.ts`, or a renamed/split `src/main/block-lookup-rendered-preview-matching.ts` if the Module gets deeper during implementation.

Interface:

- Input: `BlockLookupRecord[]`, extracted preview candidates with `assetName`, `cacheRelativePath`, optional dimensions, and optional source metadata.
- Output: records with a persisted rendered-preview reference.
- Policy owned here: candidate names, token normalization, exact/partial/token scoring, Blockpedia priority, generic-token rejection, variant conflicts, and no-placeholder behavior.

Rust sidecar remains a legitimate boundary Adapter for Unity extraction:

- It may normalize requested names enough to avoid unnecessary extraction.
- It must not parse TextAsset fields to independently infer block match keys.
- It must not decide final record assignment.
- It must return extracted preview candidates, not assigned previews.

Hard cut:

- Remove Rust TextAsset-derived preview key ownership (`create_preview_match_keys` from sidecar text assets).
- Require TypeScript to pass explicit preview match names whenever it asks the sidecar to extract preview assets.
- If no explicit preview match names are supplied, the sidecar should extract no preview assets for app-driven rendered-preview builds.

Implementation shape:

1. In TypeScript bundle indexing, extract text records first.
2. Build records and preview match names in TypeScript.
3. Ask the sidecar for preview candidates with those names.
4. Assign previews with the TypeScript matching Module.
5. Keep the existing same-mod JSON pass as indexing orchestration, but it should reuse the same match-name and assignment Interface.

This may run the sidecar twice for changed bundle sources when rendered previews are enabled. That cost is acceptable for ownership clarity unless profiling proves otherwise.

### Decision 2: Persist Cache-Relative Preview References

Winning owner: `shared/block-lookup.ts` defines the persisted rendered-preview shape.

Hard cut:

- Replace persisted `renderedPreview.imageUrl` with `renderedPreview.cacheRelativePath`.
- Keep `width` and `height`.
- Split the persisted Block Lookup record Interface from the renderer/search row Interface, or project search rows before IPC. Persisted records carry `cacheRelativePath`; renderer-facing rows carry an explicit presentation URL such as `renderedPreview.imageUrl`.
- Create `image://block-preview/...` URLs at that main/renderer presentation seam, not in the index JSON.
- Hard-bump `BLOCK_LOOKUP_INDEX_VERSION`; no migration is needed for this greenfield project.

This makes pruning, index normalization, and ADR-0007 agree on one durable contract.

Current evidence:

- `BlockLookupRecord` is currently both the persisted index record and renderer row shape.
- `BlockLookupSearchResult.rows` returns records directly from the persisted search index.
- `BlockLookupView` reads `record.renderedPreview.imageUrl` directly.

Therefore T021 is not a tiny persisted-shape-only patch. It must either introduce distinct persisted/public record types or add a main search projection that converts cache-relative preview references into renderer-facing protocol URLs.

### Decision 3: Main Block Lookup Boundary Owns Cache Pruning

Winning owner: a main-process cache Module called from `buildBlockLookupIndex`, for example `src/main/block-lookup-rendered-preview-cache.ts`.

Interface:

- Input: preview cache directory and the successfully written `PersistedBlockLookupIndex`.
- Live set: cache-relative paths referenced by both `index.records` and `index.sourceRecords`.
- Action: delete unreferenced files under `block-lookup-rendered-previews` after the index JSON has been written successfully.

Policy:

- Never prune before or during a build.
- Failed builds leave existing previews and any newly written orphan files untouched until the next successful build.
- A successful preview-disabled build has an empty live set and may remove cached preview images.
- Pruning failures are logged and do not invalidate the successful index build.
- The pruner must stay inside the dedicated preview cache namespace and must not touch mod or Workshop preview images.
- The pruner should preserve cache metadata files that are not rendered-preview image outputs, including `blockpedia/manifest.json`.

Blockpedia manifest handling:

- The manifest loader owns fetching and validating official Blockpedia cache entries.
- The pruner owns cache file reachability from the final index.
- `blockpedia/manifest.json` is cache metadata, not a rendered-preview output. Preserve it during pruning.
- If pruning removes unreferenced Blockpedia images that a manifest still lists, the existing manifest validation will force a future refetch. That is acceptable unless later product requirements call for a longer-lived Blockpedia source cache.

## Findings

1. High severity: Rendered-preview matching policy is multiply owned.
   - Classification: `architecture / SSOT bug`
   - Competing owners: TypeScript assignment, Rust sidecar TextAsset-derived candidate keys, same-mod JSON preview pass.
   - Winner: TypeScript rendered-preview matching Module.
   - Delete: Rust TextAsset-derived preview match key policy.
   - Keep: Rust request-name filtering as a boundary Adapter for extraction cost.
   - Guardrail: remove Rust TextAsset-derived matching only after every preview-enabled TypeScript sidecar call passes explicit `previewMatchNames`.

2. Medium-high severity: persisted rendered-preview references use protocol URLs instead of cache-relative paths.
   - Classification: `architecture / SSOT bug`
   - Competing owners: preview protocol URL construction and persisted index shape.
   - Winner: shared Block Lookup persisted contract.
   - Delete: persisted `imageUrl` as durable cache identity.
   - Keep: protocol URL construction at presentation/request-resolution seams, with either distinct persisted/public record types or a main search projection.

3. Medium severity: cache pruning has no owner yet.
   - Classification: `architecture / SSOT gap`
   - Competing candidate owners: index builder, preview protocol, sidecar, Blockpedia loader, main Block Lookup boundary.
   - Winner: main Block Lookup boundary after successful index write.
   - Delete: any future attempt to prune from the sidecar, extractor, or renderer.
   - Keep: sidecar and Blockpedia loader write caches; main prunes reachable image outputs and preserves cache metadata.

## Suggested Worker Tranches

### T021 Persisted Preview Reference Contract

Allowed files:

- `src/shared/block-lookup.ts`
- `src/main/block-lookup-rendered-preview-assignment.ts`
- `src/main/preview-protocol.ts`
- `src/main/block-lookup.ts`
- `src/main/block-lookup-search.ts` if main projects persisted records into renderer-facing rows
- `src/renderer/views/BlockLookupView.tsx` if the renderer owns the final protocol URL projection
- focused main and renderer tests for Block Lookup, Preview Protocol, and the preview surface

Verification:

- `cd ~/dev/TTSMM-EX && pnpm vitest run src/__tests__/main/BlockLookupRenderedPreviewAssignment.test.ts src/__tests__/main/BlockLookup.test.ts src/__tests__/main/PreviewProtocol.test.ts`
- `cd ~/dev/TTSMM-EX && pnpm vitest run src/__tests__/renderer/BlockLookupView.test.tsx`
- `cd ~/dev/TTSMM-EX && pnpm run typecheck`

Stop if:

- renderer preview projection requires broad UI changes beyond the Block Lookup preview surface
- persisted preview availability semantics become ambiguous

### T022 TypeScript-Owned Sidecar Match Requests

Allowed files:

- `src/main/block-lookup-bundle-text-assets.ts`
- `src/main/block-lookup-extraction.ts`
- `src/main/block-lookup-index-build.ts`
- `src/main/block-lookup-rendered-preview-assignment.ts`
- `native/block-lookup-extractor/src/main.rs`
- focused main tests and native extractor tests

Verification:

- `cd ~/dev/TTSMM-EX && pnpm vitest run src/__tests__/main/BlockLookupRenderedPreviewAssignment.test.ts src/__tests__/main/BlockLookup.test.ts`
- `cd ~/dev/TTSMM-EX/native/block-lookup-extractor && cargo test`
- `cd ~/dev/TTSMM-EX && pnpm run typecheck`

Stop if:

- any preview-enabled TypeScript sidecar call site cannot supply explicit `previewMatchNames`
- implementation needs a new long-lived sidecar protocol shape beyond explicit request names
- extraction performance becomes unacceptable without a measured alternative

### T023 Post-Success Preview Cache Pruning

Allowed files:

- `src/main/block-lookup.ts`
- `src/main/block-lookup-rendered-preview-cache.ts`
- `src/main/preview-protocol.ts` if cache path helpers need reuse
- focused main tests

Verification:

- `cd ~/dev/TTSMM-EX && pnpm vitest run src/__tests__/main/BlockLookup.test.ts src/__tests__/main/PreviewProtocol.test.ts`
- `cd ~/dev/TTSMM-EX && pnpm run typecheck`

Stop if:

- pruning cannot identify live paths from cache-relative persisted references
- deletion would need to operate outside `block-lookup-rendered-previews`
- preserving cache metadata such as `blockpedia/manifest.json` conflicts with cache reachability tests

Required test cases:

- unreferenced image files under `block-lookup-rendered-previews` are deleted only after a successful index write
- failed build or failed index write does not prune
- image paths referenced only by `sourceRecords` survive
- preview-disabled successful builds remove unreferenced image outputs
- `blockpedia/manifest.json` survives pruning
- path traversal cannot escape the preview cache root

## Recommendation

Run T021 first. The persisted cache-relative contract is the leverage point for both matching clarity and safe pruning. Then run T022 to remove Rust-owned matching policy. Run T023 last, because pruning should be implemented only after live preview references are durable and easy to collect.

T021 is the highest-risk design tranche because it must clarify the public row shape. Prefer a main-process search projection if that keeps renderer components simple: persisted index records stay cache-relative, while `BlockLookupSearchResult.rows` receives the presentation URL it already renders.
