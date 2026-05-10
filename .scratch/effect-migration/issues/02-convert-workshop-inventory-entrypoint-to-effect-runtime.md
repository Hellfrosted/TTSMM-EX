Status: ready-for-agent

# Convert Workshop Inventory Entrypoint To Effect Runtime

## What to build

Convert the Workshop inventory / mod metadata scan entrypoint to run through a small Effect runtime boundary while preserving the existing renderer and IPC contract. The user-visible behavior of loading local mods, Workshop mods, known Workshop mods, and dependency metadata should remain unchanged.

This slice should be a thin vertical tracer through the existing `readModMetadata` path: Electron IPC still returns the same shape, the renderer keeps using the same API call, and tests continue to exercise the same user-facing scan behavior.

## Acceptance criteria

- [ ] The mod metadata scan can run through an Effect runtime from the main-process entrypoint.
- [ ] The renderer API contract for reading mod metadata is unchanged.
- [ ] Existing local mod and Workshop mod scan behavior is preserved.
- [ ] Effect is run at the main-process boundary rather than inside renderer code.
- [ ] Focused tests for the mod metadata scan path pass.

## Blocked by

- `.scratch/effect-migration/issues/01-prove-effect-bundles-in-electron-main.md`
