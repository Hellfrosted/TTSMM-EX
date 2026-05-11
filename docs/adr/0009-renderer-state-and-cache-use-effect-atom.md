# ADR 0009: Renderer State And Cache Use Effect Atom

## Status

Accepted

Last reviewed: 2026-05-11

## Context

The renderer previously had multiple local state and async-cache owners. Server-style async caches used React Query, while local UI state stores used Zustand. That split made renderer ownership harder to reason about because config, collections, mod metadata, Block Lookup results, table state, and app shell state could each be updated through different cache/store APIs.

TTSMM-EX is a desktop app with Electron IPC as its external data boundary. Renderer caches adapt main-process results for UI responsiveness, but the main process remains the persistence and lifecycle authority for config, collection files, Steamworks scans, Block Lookup indexing, and game process checks.

## Decision

Renderer-local state and async-cache ownership uses Effect Atom refs.

Effect Atom owns:

- loaded config cache and accepted config writes
- collection list/detail cache and authoritative collection lifecycle projections
- mod metadata scan cache
- game-running status cache
- Block Lookup bootstrap and search cache
- app shell state, main collection table state, and Block Lookup table state

React Query and Zustand are not renderer owners in this project. Do not reintroduce them as parallel cache or local-state systems.

Renderer code may still expose small hook-shaped mutation helpers where React workflows need a `mutateAsync`-style callback, but those helpers should update Effect Atom state directly rather than hiding another cache owner.

## Consequences

- Renderer cache invalidation is an Effect Atom concern.
- Main-process lifecycle and persistence decisions remain authoritative; renderer Atom state mirrors accepted results.
- Test helpers should not install React Query providers or Zustand stores.
- New renderer state should either live in existing React component state for local view-only concerns or in an Effect Atom ref when it is shared, cached, or cross-workflow state.
- Any future state library proposal needs a new decision that explains why Effect Atom is insufficient for the specific boundary.
