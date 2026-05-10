# Population Pool PRD

Status: prototype-learnings-captured
Owner: product
Last updated: 2026-05-07

Related decision: [ADR 0006, Population Pool Uses TAC RawTech Files](../../docs/adr/0006-population-pool-uses-tac-rawtech-files.md)

## Summary

Population Pool adds a dedicated TTSMM-EX workspace for managing TerraTech Tech definitions that TACtical_AI can spawn as local population candidates.

The feature is intentionally pool-first. The primary list shows **Active Population Entries**, which are TAC-compatible RawTech files currently present in TACtical_AI's `Raw Techs/Enemies/eLocal` folder. **Disabled Population Entries** are recoverable files moved out of that active folder. **Population Candidates** from saved TerraTech snapshots, Workshop content, and remembered Workshop requests support add workflows, but they are not presented as spawnable until they become TAC-compatible RawTech entries.

The prototype validated a single production direction: a table-first **Population Pool** workspace using the same dense desktop language as Mod Collections and Block Lookup. The real feature should use scanner-backed data only. Sample Techs, fake source rows, UI variants, and local-only mutations should not remain in production.

The current production slice is the **Population Pool Scanner**: route, sidebar placement, staged workspace mounting, Variant A table layout, source filters, inspector, real scan results for active RawTech files, disabled RawTech files, saved snapshots, subscribed Steam Workshop Techs, and stored Workshop requests. Stable file operations remain a later slice and must stay disabled until real write IPC exists.

## Problem

TACtical_AI can spawn local population entries only from its RawTech folder. TerraTech saved snapshots and Steam Workshop contents live elsewhere, and neither source is automatically a TAC-compatible RawTech file.

Today, users who want local TACtical_AI populations must understand that storage split themselves. That creates three product risks:

1. Users cannot easily see what TACtical_AI can currently spawn.
2. Candidate sources can be mistaken for active, spawnable population membership.
3. Experimental Workshop additions can pollute the TAC local folder if the app writes guessed RawTech files.

## Goals

1. Give users a dedicated **Population Pool** workspace in the main app flow.
2. Make active TACtical_AI population membership visible before candidate discovery.
3. Preserve TACtical_AI's local RawTech folder as the source of truth for stable membership.
4. Separate active entries, disabled entries, saved snapshot candidates, Workshop content, and Workshop requests in both data model and UI language.
5. Prevent unproven Workshop or saved snapshot data from being presented as guaranteed spawnable RawTech.
6. Make risky writes explicit when TerraTech is already running.
7. Ship the feature through small, reviewable slices that do not destabilize existing Mod Collections, Block Lookup, Settings, or launch readiness workflows.

## Non-Goals

- No open-ended Steam Workshop search.
- No guaranteed conversion from saved TerraTech snapshots to TAC-compatible RawTech data.
- No guaranteed conversion from arbitrary Workshop items to TAC-compatible RawTech data.
- No guessed, placeholder, or synthetic TAC RawTech files for experimental Workshop adds.
- No global Settings redesign for Population Pool paths in the first version.
- No change to TACtical_AI behavior or TerraTech population internals.
- No complete file-operation implementation in the scanner slice.

## Product Register And UX Direction

Register: product.

Scene: a TerraTech mod user is preparing a launch from a dense desktop control surface, scanning mod state, population readiness, and TAC path health before starting the game.

The workspace should feel like the rest of TTSMM-EX: compact, direct, warm dark neutral, and operational. It should not feel like a storefront, wiki, campaign page, or experimental dashboard.

UX principles:

1. Lead with current membership. Candidates only matter after the user understands what TACtical_AI can already load.
2. Use terms from `CONTEXT.md` verbatim in headings, empty states, tests, and issue titles.
3. Keep state separations visible. Active, disabled, candidate, and experimental request surfaces must not collapse into one undifferentiated list.
4. Prefer inline repair. **Population Path Status** belongs in the Population Pool workspace because path health is part of the task.
5. Treat write operations as pre-launch edits. Direct writes are allowed, but require confirmation when TerraTech is running.
6. Use real scanner data only. If a source is unavailable, show path/status copy instead of prototype rows.
7. Keep the table controls consistent with existing workspaces: column order, visibility, width, and compact rows should persist through `AppConfig.viewConfigs`.

## Prototype Learnings

The throwaway prototype answered the UI and source-model questions. These are now product requirements, not prototype code:

1. **Variant A is the chosen topology.** A compact table with source filters and an inspector feels closest to Mod Collections and Block Lookup. Variant switching, alternate layouts, and standalone prototype routes should be removed.
2. **The UI must not feel like a separate app.** Population Pool should use the existing workspace header, toolbar density, table controls, icon buttons, dark neutral surfaces, and inspector pattern.
3. **Real data is mandatory.** The feature should scan live sources and never ship sample Tech rows or placeholder mods-as-techs data.
4. **Workshop Techs are not mods.** Steam Workshop scanning must use the paged UGC subscription query for items tagged `Techs`, and must exclude items tagged `Mods`.
5. **Workshop tags are descriptive metadata.** Tags such as `GSO`, `Hawkeye`, `Tank`, and `Turret` come from Steam Workshop Tech tags; they are not separate TTSMM-EX source types.
6. **Saved Tech previews need the preview protocol.** Local snapshot thumbnails must be registered through the renderer-safe preview image protocol instead of exposing raw file paths directly.
7. **Workshop requests are sidecar state.** A Workshop request is an experimental remembered intent in TTSMM-EX user data, not a TAC RawTech file and not active population membership.
8. **Actions stay disabled until real writes exist.** Disable, restore, stable add, and request creation should not mutate renderer-local state as a stand-in for file or user-data operations.
9. **The table settings owner should match Block Lookup and Mod Collections.** Population Pool should not own durable column state only inside its reducer.
10. **Shared contracts need one owner.** Population Pool entry shape, source names, and Workshop Tech tag values should live in shared code and be imported by the renderer.

## User Stories

1. As a TerraTech mod user, I want a **Population Pool** workspace in the sidebar after **Mod Collections**, so that population setup fits the existing launch-preparation flow.
2. As a TerraTech mod user, I want **Block Lookup** to remain after **Population Pool**, so that block investigation stays available after collection and population setup.
3. As a TerraTech mod user, I want to see **Active Population Entries** first, so that I know what TACtical_AI can currently spawn.
4. As a TerraTech mod user, I want **Disabled Population Entries** separated from active entries, so that recoverable files do not look spawnable.
5. As a TerraTech mod user, I want clear empty states for active and disabled views, so that first-run setup and recovery inventory are understandable.
6. As a TerraTech mod user, I want **Population Path Status** in the workspace, so that TAC, snapshot, and Workshop folder problems are visible where I manage the pool.
7. As a TerraTech mod user, I want saved TerraTech snapshots shown as **Saved Tech Candidates**, so that I can review possible additions without assuming they are stable.
8. As a TerraTech mod user, I want stable adds limited to **TAC-Compatible Population Entries**, so that the app only writes data TACtical_AI can load.
9. As a TerraTech mod user, I want **Experimental Workshop Population Adds** clearly marked and opt-in, so that I understand the risk before creating a request.
10. As a TerraTech mod user, I want **Workshop Population Requests** stored in TTSMM-EX user data, so that experimental choices persist without writing unproven RawTech files.
11. As a TerraTech mod user, I want removals to create **Disabled Population Entries** instead of deleting files, so that I can recover user-created Tech data.
12. As a TerraTech mod user, I want a warning before writes when TerraTech is already running, so that I can avoid surprising in-game reload behavior.
13. As a keyboard user, I want sidebar order, source filters, table controls, buttons, and candidate actions to be reachable and announced predictably.
14. As a maintainer, I want route, navigation, file discovery, file operations, and request persistence implemented as separate slices, so that each behavior can be reviewed and tested directly.

## Requirements

### IA And Navigation

- Add a routed **Population Pool** workspace.
- Place **Population Pool** after **Mod Collections** and before **Block Lookup** in the main sidebar.
- Preserve existing staged workspace behavior so mounted workspaces remain spatially stable while navigating.
- Include the route in persisted current-path behavior using the same conventions as existing workspaces.
- Keep the first scaffold independent from launch validation side effects.

### Workspace Scaffold

- Render a workspace header titled **Population Pool**.
- Use the validated table-first layout: toolbar, source filters, configurable table, and inspector pane.
- Do not ship prototype layout variants or a variant switcher.
- Render inline **Population Path Status** with separate rows or indicators for:
  - **TAC Local Population Folder**
  - **Saved Tech Snapshot Folder**
  - **Workshop Content Folder**
- Keep active entries, disabled entries, saved candidates, Workshop Tech candidates, and Workshop requests visually distinguishable in the table.
- Provide source filters for active entries, disabled entries, saved candidates, Workshop Tech candidates, and Workshop requests.
- Include empty states for:
  - No active entries.
  - No disabled entries.
  - Missing TAC path.
  - Candidate discovery unavailable.
- Label experimental affordances as **Experimental Workshop Population Add** and keep them visually subordinate to stable add paths.

### Path Discovery

- Discover the **TAC Local Population Folder**, **Saved Tech Snapshot Folder**, and **Workshop Content Folder** independently.
- Do not infer one path from another unless a later decision documents a reliable relationship.
- Show path failures inline through **Population Path Status**.
- Support manual overrides in a later slice if automatic discovery cannot resolve a path.

### Table Settings

- Provide the same durable table settings users expect from Mod Collections and Block Lookup.
- Persist Population Pool column order, visibility, width, and compact row preference in `AppConfig.viewConfigs`.
- Do not store durable table settings only in renderer reducer state.
- Keep transient table state, such as selection, filter, search query, loading state, and warnings, local to the workspace.

### Stable Population Membership

- Treat TACtical_AI's `Raw Techs/Enemies/eLocal` folder as the canonical active membership source.
- Scan active membership from files in the **TAC Local Population Folder**.
- Only classify proven TAC-compatible RawTech files as **Active Population Entries**.
- Add stable entries only from **TAC-Compatible Population Entries**.
- Do not create a separate TTSMM-EX membership file for stable active entries.

### Disabled Entries

- Removing a stable entry must move the file out of the active TAC folder.
- The moved file becomes a **Disabled Population Entry**.
- Disabled entries must not appear in the default active list.
- Restoring a disabled entry must move it back into the active TAC folder.
- Delete should not be the first removal behavior. If permanent deletion is added later, it must be separate from disabling and require stronger confirmation.

### Candidates

- Show saved TerraTech snapshots as **Saved Tech Candidates** until conversion or compatibility is proven.
- Show subscribed Steam Workshop items tagged `Techs` as **Workshop Tech Candidates**.
- Exclude Steam Workshop items tagged `Mods` from Workshop Tech candidate results.
- Show Workshop-related items as candidates or requests, not as stable entries, unless TAC-compatible RawTech data is available.
- Candidate rows must communicate source and compatibility state without relying on color alone.
- Candidate actions must make the difference between stable add and experimental request explicit.

### Workshop Requests

- Represent **Experimental Workshop Population Adds** as **Workshop Population Requests**.
- Store Workshop Population Requests in TTSMM-EX user data.
- Do not write guessed TAC RawTech files for Workshop requests.
- Do not store Workshop requests in the TAC local population folder.
- Experimental request persistence must survive app restart.

### Running-Game Write Guard

- Detect whether TerraTech is already running before writes to the TAC local population folder.
- Require user confirmation before stable add, disable, restore, or other write operations while TerraTech is running.
- The confirmation copy must state that the write affects TACtical_AI local population files.
- If detection fails, prefer an explicit caution state over silent writes.

## Implementation Slices

### Slice 1: Population Pool Scanner

Deliver route, navigation order, staged workspace mounting, Variant A table layout, source filters, inspector, read-only action affordances, and scanner-backed rows for active RawTech files, disabled RawTech files, saved snapshots, Workshop Tech subscriptions, and stored Workshop requests.

Acceptance criteria:

- Sidebar order is Mod Collections, Population Pool, Block Lookup.
- Navigating to Population Pool renders the workspace without affecting existing workspaces.
- The table uses real scanner data only.
- Active, disabled, saved, Workshop Tech, and Workshop request entries remain distinguishable by source.
- Subscribed Workshop Techs are loaded through the paged Steam UGC query for `Techs` and exclude `Mods`.
- Saved snapshot previews render through the preview image protocol.
- Empty states use Population Pool vocabulary from `CONTEXT.md`.
- No file system or user-data writes occur in this slice.

### Slice 2: Persisted Population Table Settings

Deliver durable table controls consistent with Mod Collections and Block Lookup.

Acceptance criteria:

- Column order, visibility, width, and compact rows persist across app restart.
- Population Pool table settings are stored under `AppConfig.viewConfigs`.
- Shared view-config helpers own normalization, defaulting, and minimum width behavior.
- The renderer reducer no longer owns durable table settings.

### Slice 3: Population Path Status

Deliver independent path discovery and inline status for the TAC local population, saved snapshot, and Workshop content folders.

Acceptance criteria:

- Each path reports detected, missing, or manually set state independently.
- Missing TAC path blocks stable file operations but does not block opening the workspace.
- Saved snapshot and Workshop path failures affect only their candidate sections.
- Path status is testable without rendering the full workspace.

### Slice 4: Active And Disabled RawTech Hardening

Harden TAC RawTech scanning for active entries and disabled-entry discovery.

Acceptance criteria:

- Active entries come from the TAC local population folder.
- Disabled entries come from the disabled storage location chosen by implementation.
- Invalid or unsupported files are not presented as active entries.
- Scanning handles empty folders, unreadable files, and long file names without breaking the workspace.

### Slice 5: Stable Add, Disable, And Restore

Deliver stable file operations for TAC-compatible RawTech entries.

Acceptance criteria:

- Stable add writes only TAC-compatible RawTech data to the TAC local population folder.
- Disable moves an active file out of the active TAC folder.
- Restore moves a disabled file back into the active TAC folder.
- Operations refresh visible state after completion.
- TerraTech-running confirmation is enforced before writes when relevant.

### Slice 6: Saved Tech Candidate Conversion

Deliver saved snapshot compatibility checks and conversion affordances without promising stable compatibility before proof exists.

Acceptance criteria:

- Saved snapshots appear as **Saved Tech Candidates**.
- Saved candidates are not shown as active entries.
- Add actions are disabled or clearly gated unless TAC-compatible RawTech data exists.
- Candidate copy avoids implying guaranteed conversion.

### Slice 7: Workshop Population Requests

Deliver opt-in experimental request persistence.

Acceptance criteria:

- Experimental Workshop actions create **Workshop Population Requests** in TTSMM-EX user data.
- Requests survive app restart.
- Requests do not create files in the TAC local population folder.
- Request UI remains separate from active and disabled entries.

## Acceptance Criteria

The feature is complete when:

1. Users can open **Population Pool** from the sidebar in the correct workflow order.
2. Users can distinguish active TAC-spawnable entries from disabled files, saved candidates, Workshop candidates, and Workshop requests.
3. Stable active membership is derived from TACtical_AI's local RawTech folder.
4. Removing a stable entry disables rather than deletes it.
5. Experimental Workshop additions persist only as Workshop Population Requests.
6. Writes to TAC local population files require confirmation when TerraTech is already running.
7. Population-specific path health appears inline in the workspace.
8. Existing Mod Collections, Block Lookup, Settings, validation, and launch flows continue to behave as before.

## Testing Strategy

- Renderer route and shell tests for sidebar order, route classification, current-path persistence, workspace mounting, default view, source filter state, and scanner empty-state copy.
- Focused component tests for **Population Path Status**, source filters, scanner-backed rows, candidate sections, and experimental affordances.
- Path discovery unit tests for independent TAC, saved snapshot, and Workshop content path resolution.
- File operation tests using temporary directories for stable add, disable, restore, refresh, invalid files, and failure states.
- Running-game confirmation tests for write operations.
- Workshop request persistence tests that verify user-data storage and no writes to the TAC local population folder.
- Accessibility checks for headings, tab semantics, keyboard navigation, focus visibility, non-color-only status, and disabled actions.

## Open Questions

1. Where should disabled RawTech files live relative to the TAC local population folder?
2. What exact compatibility check defines a **TAC-Compatible Population Entry**?
3. How should duplicate names or duplicate source files be resolved when adding or restoring entries?
4. What process signal should the running-game write guard use for TerraTech on Windows and Proton?
5. Should manual path overrides be stored globally, per profile, or as Population Pool-only preferences?

## Documentation Notes

- ADR 0006 is authoritative for source-of-truth behavior.
- `CONTEXT.md` is authoritative for feature vocabulary.
- Implementation issues should be created under `.scratch/population-pool/issues/`.
- Issue titles and acceptance criteria should preserve the terms **Population Pool**, **Active Population Entry**, **Disabled Population Entry**, **Population Candidate**, **Saved Tech Candidate**, **TAC-Compatible Population Entry**, **Experimental Workshop Population Add**, and **Workshop Population Request**.
