# Active And Disabled RawTech Hardening

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Harden TAC RawTech scanning so Active Population Entries and Disabled Population Entries are derived from real files and failure states do not break the Population Pool workspace. Invalid or unsupported files should be handled explicitly and must not be presented as active TAC-spawnable entries.

This slice depends on the disabled RawTech storage decision and follows ADR 0006 for active membership.

## Acceptance criteria

- [x] Active Population Entries come from the TAC Local Population Folder.
- [x] Disabled Population Entries come from the documented disabled storage location.
- [x] Invalid or unsupported files are not presented as Active Population Entries.
- [x] Empty active and disabled folders render understandable empty states.
- [x] Unreadable files produce row-level or source-level failure information without breaking the workspace.
- [x] Long file names do not break table layout, inspector layout, or scanner results.
- [x] Scanner behavior is covered with focused tests using temporary directories or equivalent isolated fixtures.
- [x] Existing Population Pool scanner behavior for saved candidates, Workshop candidates, and Workshop requests does not regress.

## Blocked by

- .scratch/population-pool/issues/04-resolve-disabled-rawtech-storage-decision.md

