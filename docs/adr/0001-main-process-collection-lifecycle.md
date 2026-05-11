# ADR 0001: Main Process Owns Collection Lifecycle Authority

## Status

Accepted

Last reviewed: 2026-05-01

## Context

Collection create, duplicate, rename, delete, and switch flows affect both collection files and `config.activeCollection`. Startup can also discover that `config.activeCollection` points at no saved collection, or that no collections exist yet. When the renderer coordinates those writes directly, UI feature code must also coordinate rollback branches for partial failures. That makes collection startup and user-visible lifecycle flows fragile and spreads persistence rules across the renderer.

The existing persisted shapes remain valid:

- `config.json` keeps its current fields, including `activeCollection`.
- `collections/*.json` keeps the current `ModCollection` shape.

## Decision

The main process is the canonical owner for collection lifecycle authority. The renderer requests explicit lifecycle commands, and the main process validates names, rejects duplicates, carries dirty active collection edits through identity changes when supplied, writes collection/config files, selects the active collection, and returns one structured result for the renderer to apply.

The main process also owns Startup Collection Resolution. During startup, the renderer may provide the loaded config and collection set, but the main process decides whether to keep the configured Active Collection, select a valid saved collection, or create the default collection before the Collection workspace loads.

Renderer feature flows should apply returned state and report user-safe messages. They should not coordinate lifecycle rollback primitives such as "write collection, write config, delete new file if config fails" as their canonical model.

Low-level collection file helpers may still exist inside the main process, but renderer feature flows should use lifecycle commands for create, duplicate, rename, delete, and switch. Renderer-accessible IPC should not expose direct rename or delete collection shortcuts. Startup loading should use Startup Collection Resolution instead of renderer-owned repair snapshots.

Saving edits to the enabled TerraTech Mods inside the Active Collection is a Collection Content Save, not a Collection Lifecycle Command, unless the operation also creates, duplicates, renames, deletes, or switches the Active Collection.

When a lifecycle command receives a dirty Active Collection Draft, it preserves that draft for commands where the source collection continues to exist or is transformed: create, switch, duplicate, and rename. Delete discards the dirty draft with the deleted collection after the normal user confirmation.

Renderer async-cache code may wrap the renderer request/application flow, but cache invalidation does not become the authority for lifecycle persistence. The main process remains the boundary that validates names, writes collection/config files, and returns the authoritative post-command state.

## Consequences

- Lifecycle failure behavior can be tested at the persistence boundary.
- Renderer collection UI code becomes responsible for user intent and state application, not filesystem recovery.
- Renderer startup code becomes responsible for loading and applying startup state, not deciding Active Collection repair.
- Existing saved data loads without migration because persisted collection and config file shapes are preserved.
