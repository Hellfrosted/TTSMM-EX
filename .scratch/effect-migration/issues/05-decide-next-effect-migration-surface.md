Status: ready-for-human

# Decide Next Effect Migration Surface

## What to build

Review the completed Workshop inventory Effect slice and decide whether the next migration surface should be Block Lookup indexing, renderer concurrency, IPC validation, or no further migration for now. The outcome should be a documented decision that prevents accidental broad migration drift.

This is a human decision checkpoint. It should compare practical benefit, implementation cost, test coverage, packaging risk, and the amount of duplicated validation or async ownership each option would introduce.

## Acceptance criteria

- [ ] The completed Workshop inventory slice is reviewed for maintainability, behavior preservation, and validation cost.
- [ ] The next migration surface is selected or further migration is explicitly deferred.
- [ ] The decision states whether Zod remains the boundary validator or whether a specific boundary will be hard-cut to Effect Schema.
- [ ] The decision states whether React Query remains the renderer cache owner.
- [ ] Follow-up implementation issues are created only for the selected next surface.

## Blocked by

- `.scratch/effect-migration/issues/02-convert-workshop-inventory-entrypoint-to-effect-runtime.md`
- `.scratch/effect-migration/issues/03-model-steamworks-workshop-failures-as-typed-effects.md`
- `.scratch/effect-migration/issues/04-preserve-workshop-dependency-snapshot-semantics.md`
