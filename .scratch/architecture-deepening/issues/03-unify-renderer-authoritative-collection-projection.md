Status: resolved

Triage: enhancement, resolved in this workspace.

Resolution: `src/renderer/authoritative-collection-state.ts` is the shared renderer projection module for accepted collection authority, and accepted collection content saves now use that same module for AppState collection projection. Collection cache projection is centralized in `src/renderer/collection-cache.ts`.

# Unify Renderer Authoritative Collection Projection

## What to build

Add one renderer projection Module that applies accepted collection authority to both renderer AppState and the Effect Atom collection cache.

Lifecycle results and Collection Content Save results should use the same projection rules for Active Collection, collection maps, collection names, config state, and stale cache cleanup.

## Acceptance criteria

- [x] Accepted lifecycle results update AppState and the collection cache through one projection path.
- [x] Accepted Collection Content Save results use the same projection rules for the changed collection.
- [x] Tests cover rename, delete, switch, and content-save projections.
- [x] Tests prove stale cached collection entries are removed when collection identity changes.
- [x] The projection Module keeps the main process as the persistence and lifecycle authority.

## Blocked by

None - can start immediately
