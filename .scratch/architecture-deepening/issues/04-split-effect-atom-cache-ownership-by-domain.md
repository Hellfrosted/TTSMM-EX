Status: resolved

Triage: enhancement, resolved in this workspace.

Resolution: split the renderer Effect Atom cache into focused domain modules: config, collection, mod metadata, game status, and Block Lookup. `src/renderer/async-cache.ts` remains a compatibility export barrel, so existing callers keep using the same import path while ownership lives in domain modules.

# Split Effect Atom Cache Ownership By Domain

## What to build

Split renderer Effect Atom cache ownership into domain cache Modules while preserving ADR 0009: Effect Atom remains the renderer state and async-cache owner.

The split should make config, collection, mod metadata, game status, and Block Lookup cache behavior independently understandable and testable. Collection cache splitting should build on the authoritative collection projection Module.

## Acceptance criteria

- [x] Config cache behavior is exposed from a focused domain cache Module.
- [x] Collection cache behavior is exposed from a focused domain cache Module and uses the authoritative collection projection path.
- [x] Mod metadata, game status, and Block Lookup cache behavior no longer require editing an omnibus cache Module for unrelated changes.
- [x] Focused tests cover each domain cache Module's accepted-write, read, and invalidation behavior where applicable.
- [x] Existing renderer callers continue to use Effect Atom cache ownership, with no React Query or Zustand ownership reintroduced.

## Blocked by

- 03-unify-renderer-authoritative-collection-projection.md
