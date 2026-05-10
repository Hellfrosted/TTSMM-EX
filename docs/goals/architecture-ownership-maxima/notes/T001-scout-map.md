# T001 Scout Map

## Taxonomy

- `architecture / SSOT bug`: Rendered Block Previews asset matching and progress semantics are split across Rust extraction, TypeScript assignment, index build orchestration, and renderer phase display.
- `architecture / SSOT bug`: Block Lookup persisted view config only partly owns width normalization; renderer projection and serialization repair width rules after the shared normalizer.
- `local dedupe cleanup`: Generic view-config order/default-equivalence helpers are duplicated in shared main config, shared Block Lookup config, and renderer helper modules.
- `local dedupe cleanup`: Main collection width clamping is repeated in shared normalization, renderer commands, and settings form helpers.
- `local dedupe cleanup`: Collection lifecycle name validation is enforced in main, prevalidated in the renderer runner, and adapted again in modal validation.
- `local dedupe cleanup`: Workshop Dependency Snapshot refresh state has a shallow pass-through helper and duplicate renderer state reads.
- `legitimate boundary adapter`: Renderer form validation, React Query cache sync, startup/config adapters, and Block Lookup Preview column filtering adapt authoritative state for UI.
- `legitimate domain constraint`: Mod Manager deselect protection, preview protocol path validation, and virtual table pixel clamps are runtime constraints with one local owner.

## Highest-Confidence Findings

1. High: Rendered Block Previews asset matching has competing owners.
   - Competing owners: Rust sidecar candidate filtering in `native/block-lookup-extractor/src/main.rs`; TypeScript assignment in `src/main/block-lookup-rendered-preview-assignment.ts`; same-mod bundle pass in `src/main/block-lookup-index-build.ts`.
   - Recommended owner: TypeScript Block Lookup indexing Module owns record identity and preview assignment; Rust sidecar owns Unity asset extraction/rendering.
   - Hard cut: remove Rust policy-level block matching or make sidecar explicitly request-name driven. Keep Rust decode/render/cache output.
   - Risk: high; needs design decision on ADR-0007 intent before implementation.

2. High: Block Lookup Indexing Progress phase semantics are split.
   - Competing owners: progress labels and percentage math in `src/main/block-lookup-index-build.ts`; source batch reporting in `src/main/block-lookup-source-indexing.ts`; extraction and same-mod preview work in `src/main/block-lookup-extraction.ts` and `src/main/block-lookup-index-build.ts`; renderer phase text in `src/renderer/block-lookup-workspace.ts`.
   - Recommended owner: `createBlockLookupIndexBuild` owns the progress Interface.
   - Hard cut: delete preview progress that mirrors source batches; report actual preview work or rename the phase to match reality.
   - Risk: medium-high; requires careful test update.

3. Medium-high: Block Lookup view config width normalization is not canonical in shared persisted config.
   - Competing owners: `src/shared/block-lookup-view-config.ts` filters finite values; `src/renderer/block-lookup-column-config.ts` clamps on read and write.
   - Recommended owner: shared Block Lookup view config Module.
   - Hard cut: move min/default metadata needed for persistence normalization into shared/model code; renderer projection should adapt canonical config only.
   - Risk: medium; touches UI column metadata ownership.

4. Medium: Generic view-config helpers are duplicated.
   - Competing owners: `src/shared/main-collection-view-config.ts`, `src/shared/block-lookup-view-config.ts`, `src/renderer/view-config-shared.ts`.
   - Recommended owner: shared generic view-config helper Module.
   - Hard cut: move `isFiniteNumber`, order compaction/normalization, and default-equivalent checks to one shared helper; delete local duplicates.
   - Risk: low; no behavior change expected.

5. Medium: Main collection width clamping has multiple local repair sites.
   - Competing owners: `src/shared/main-collection-view-config.ts`, `src/renderer/main-view-config-columns.ts`, `src/renderer/collection-manager-form-validation.ts`.
   - Recommended owner: shared main collection view config Module.
   - Hard cut: export a shared width-normalization helper; keep form validation only for user-facing issue messages.
   - Risk: low-medium.

6. Medium: Rust raw embedded text fallback is a second extraction implementation.
   - Competing owners: ADR-0004 sidecar Unity parsing contract and fallback raw extraction in `native/block-lookup-extractor/src/main.rs`.
   - Recommended owner: Rust Unity parser path.
   - Hard cut: delete `extract_embedded_text_fallback`; keep explicit extractor errors.
   - Risk: medium; native tests required.

## Legitimate Boundary Work

- Collection lifecycle authority remains main-owned per ADR-0001. Renderer modal validation and cache sync are UI/cache adapters, not persistence owners.
- Steamworks remains the Workshop Dependency Snapshot source per ADR-0005. No active Steam Community required-items scraping path was found.
- Block Lookup Preview column filtering belongs to renderer runtime availability; persisted config can keep all column keys.
- Settings editing shape adapts persisted config for UI; shared app-config normalization remains the persisted boundary owner.

## Safe Worker Candidates

1. Consolidate generic view-config helpers into one shared helper.
   - Allowed files: `src/shared/view-config.ts` or equivalent, `src/shared/main-collection-view-config.ts`, `src/shared/block-lookup-view-config.ts`, `src/renderer/view-config-shared.ts`, direct imports, focused view-config tests.
   - Verification: `pnpm vitest run src/__tests__/renderer/view-config-persistence.test.ts src/__tests__/renderer/collection-manager-form-validation.test.ts`; `pnpm run typecheck`.

2. Export and reuse a main column width normalization helper.
   - Allowed files: `src/shared/main-collection-view-config.ts`, `src/renderer/main-view-config-columns.ts`, `src/renderer/collection-manager-form-validation.ts`, focused view-config tests.
   - Verification: same focused view-config tests; `pnpm run typecheck`.

3. Remove the Workshop Dependency Snapshot pass-through refresh helper.
   - Allowed files: `src/shared/workshop-dependency-snapshot.ts`, `src/renderer/components/collections/ModDetailsFooter.tsx`, `src/__tests__/shared/WorkshopDependencySnapshot.test.ts`, `src/__tests__/renderer/ModDetailsFooter.test.tsx`.
   - Verification: `pnpm vitest run src/__tests__/shared/WorkshopDependencySnapshot.test.ts src/__tests__/renderer/ModDetailsFooter.test.tsx`.

4. Delete renderer lifecycle-runner name preflight.
   - Allowed files: `src/renderer/collection-lifecycle-command-runner.ts`, `src/__tests__/renderer/collection-lifecycle-command-runner.test.ts`.
   - Verification: `pnpm vitest run src/__tests__/renderer/collection-lifecycle-command-runner.test.ts`.

## Judge Inputs

- Pick candidate 1 or 2 for a first implementation tranche if the goal is fast, verified local improvement.
- Defer Rendered Block Previews ownership work to a design/Judge task unless the tranche explicitly expands to Block Lookup sidecar changes.
- Treat collection lifecycle prevalidation as ambiguous: Scout disagreement exists, and ADR-0001 permits renderer UX adapters while requiring main authority.
