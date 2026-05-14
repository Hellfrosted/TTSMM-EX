# Stable Add, Disable, And Restore

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Deliver stable Population Pool file operations for TAC-Compatible Population Entries. Users can add stable entries to the TAC Local Population Folder, disable Active Population Entries into disabled storage, and restore Disabled Population Entries back into the active TAC folder. Writes are guarded when TerraTech is already running.

This slice follows ADR 0006: stable adds write only TAC-compatible RawTech entries, removals disable rather than delete, and writes require confirmation when TerraTech is running.

## Acceptance criteria

- [x] Stable add writes only TAC-Compatible Population Entry data to the TAC Local Population Folder.
- [x] Disable moves an Active Population Entry out of the active TAC folder into disabled storage.
- [x] Restore moves a Disabled Population Entry back into the active TAC folder.
- [x] Add, disable, and restore refresh visible Population Pool state after completion.
- [x] Missing TAC path blocks stable file operations with clear Population Path Status feedback.
- [x] TerraTech-running confirmation is enforced before writes when TerraTech is detected as running.
- [x] If running-game detection fails, the UI enters an explicit caution state before allowing writes.
- [x] Delete is not introduced as the primary removal behavior.
- [x] File operation tests cover success, blocked path, running-game confirmation, and failure states.

## Blocked by

- .scratch/population-pool/issues/03-population-path-status.md
- .scratch/population-pool/issues/05-active-and-disabled-rawtech-hardening.md
- .scratch/population-pool/issues/06-define-tac-compatible-population-entry-check.md

