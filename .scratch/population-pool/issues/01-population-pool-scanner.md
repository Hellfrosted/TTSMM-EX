# Population Pool Scanner

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Deliver the first read-only Population Pool workspace. Users can open Population Pool from the sidebar between Mod Collections and Block Lookup, inspect scanner-backed rows for Active Population Entries, Disabled Population Entries, Saved Tech Candidates, Workshop Tech Candidates, and Workshop Population Requests, and understand source/path availability without any file system or user-data writes.

This slice follows ADR 0006: TACtical_AI's `Raw Techs/Enemies/eLocal` folder is the source of truth for stable Population Pool membership, and candidates or requests must not be presented as active TAC-spawnable entries.

## Acceptance criteria

- [x] Sidebar order is Mod Collections, Population Pool, Block Lookup.
- [x] Navigating to Population Pool renders the workspace without affecting existing staged workspaces.
- [x] The workspace uses the table-first layout: header, toolbar, source filters, configurable table, and inspector pane.
- [x] The table uses real scanner data only; no sample Tech rows, fake source rows, or renderer-local mutation stand-ins ship.
- [x] Active, disabled, saved, Workshop Tech, and Workshop request rows remain distinguishable by source and copy, not color alone.
- [x] Subscribed Workshop Techs are loaded through the paged Steam UGC query for items tagged `Techs` and exclude items tagged `Mods`.
- [x] Saved snapshot previews render through the renderer-safe preview image protocol.
- [x] Empty states use Population Pool vocabulary from the PRD and domain docs.
- [x] Disable, restore, stable add, and request creation affordances are present only as disabled/read-only actions; no file system or user-data writes occur.

## Blocked by

None - can start immediately

## Completion note

The scanner slice shipped as the read-only foundation. Later completed slices in this backlog add guarded file and user-data writes for stable operations and Workshop Population Requests.
