# Population Path Status

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Deliver independent path discovery and inline Population Path Status for the TAC Local Population Folder, Saved Tech Snapshot Folder, and Workshop Content Folder. Path failures should explain which source is affected without blocking unrelated Population Pool sections.

This slice follows ADR 0006 by treating the TAC local population folder, saved Tech snapshot folder, and Steam Workshop content folder as separate locations.

## Acceptance criteria

- [x] TAC Local Population Folder reports detected, missing, or manually set state independently.
- [x] Saved Tech Snapshot Folder reports detected, missing, or manually set state independently.
- [x] Workshop Content Folder reports detected, missing, or manually set state independently.
- [x] Missing TAC path blocks stable file operations but does not block opening Population Pool.
- [x] Saved snapshot path failures affect only Saved Tech Candidate discovery and related empty/error states.
- [x] Workshop content path failures affect only Workshop Tech Candidate discovery and related empty/error states.
- [x] Population Path Status is testable without rendering the full Population Pool workspace.
- [x] Status copy uses Population Pool vocabulary and does not imply that candidates are active TAC-spawnable entries.

## Blocked by

- .scratch/population-pool/issues/01-population-pool-scanner.md

