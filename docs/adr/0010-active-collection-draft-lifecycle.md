# ADR 0010: Active Collection Draft Lifecycle Owns Editable Draft State

## Status

Accepted

Last reviewed: 2026-05-12

## Context

The Collection workspace has several related renderer concerns: editing enabled TerraTech Mods, tracking whether the Active Collection has unsaved changes, detecting stale validation results, deciding whether launch can proceed, saving Collection Content, and applying accepted Collection Lifecycle Command results from the main process.

ADR-0001 makes the main process authoritative for Collection Lifecycle Commands and persisted collection/config writes. ADR-0009 makes Effect Atom the renderer state and cache owner. Those decisions still leave a renderer-local question: which module owns the editable Active Collection Draft while the user is working in the Collection workspace.

When draft mutation, dirty tracking, validation freshness, save completion, lifecycle replacement, and launch readiness are spread across helper functions and hook orchestration, callers must know too much about ordering. That makes it easy to accidentally overwrite unsaved edits, launch a draft that was validated against different config, or re-run validation when a fresh result already answers the question.

## Decision

The renderer will model the Active Collection Draft lifecycle as a pure workflow module that owns editable draft state.

The Active Collection Draft lifecycle owns:

- the editable Active Collection Draft
- the config snapshot used to derive the draft validation key
- dirty draft state
- the active validation run, including whether the run was launch-triggered
- the latest validation result and its freshness
- pending launch-after-save state
- loading, saving, validating, launching, and game-running facts needed for launch readiness

The module interface receives domain events and returns the next lifecycle snapshot plus effect requests. It does not run IPC, validation, game launch, React state setters, modals, or notifications directly.

Effect requests include actions such as:

- cancel validation
- validate the Active Collection Draft
- recalculate mod data
- persist the Active Collection Draft
- launch the saved Active Collection Draft
- open the blocked Mod Manager deselect dialog
- open the validation modal
- clear launching state

`appState.activeCollection` represents accepted authoritative state from the main process. It is not the editable draft mutation owner. Renderer code that needs the editable working copy should read the Active Collection Draft lifecycle snapshot.

Ordinary authoritative Active Collection refreshes replace the Active Collection Draft only when the draft is clean. They must not overwrite a dirty Active Collection Draft.

Accepted Collection Lifecycle Command results always replace the Active Collection Draft with the accepted active collection, clear dirty state, clear pending validation, and clear pending launch-after-save state.

Successful Collection Content Save replaces the Active Collection Draft with the saved collection returned by the main process and clears dirty state. Failed Collection Content Save preserves the draft and dirty state.

Validation result freshness is derived inside the lifecycle module from the Active Collection Draft and config snapshot. Launch-triggered validation stores launch intent with the validation run. A valid launch-triggered validation requests Collection Content Save first; launch occurs only after that save succeeds and returns the saved Active Collection Draft.

Manual Collection Content Save does not require fresh passing validation. Launch requests with a fresh failed validation open the validation modal immediately instead of re-running validation.

## Consequences

- Active Collection Draft preservation, lifecycle replacement, stale validation detection, and save-before-launch ordering have one renderer-local home.
- Collection workspace callers express user/domain events instead of coordinating low-level draft and validation helper decisions.
- Tests can exercise the Active Collection Draft lifecycle through the same pure workflow interface that the renderer hook uses.
- Renderer UI and IPC code remain adapters around the workflow module rather than becoming part of its implementation.
- Main-process Collection Lifecycle authority from ADR-0001 remains unchanged.
- Effect Atom renderer ownership from ADR-0009 remains unchanged; the workflow module may be stored or driven from Effect Atom state, but it must not introduce another renderer state owner.

