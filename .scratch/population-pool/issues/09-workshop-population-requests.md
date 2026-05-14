# Workshop Population Requests

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Persist opt-in Experimental Workshop Population Adds as Workshop Population Requests in TTSMM-EX user data. Workshop requests must survive app restart and remain separate from Active Population Entries, Disabled Population Entries, and Workshop Tech Candidates.

This slice follows ADR 0006 by storing experimental requests in TTSMM-EX user data instead of writing guessed TAC RawTech files.

## Acceptance criteria

- [x] Experimental Workshop Population Add actions create Workshop Population Requests in TTSMM-EX user data.
- [x] Workshop Population Requests survive app restart.
- [x] Workshop Population Requests do not create files in the TAC Local Population Folder.
- [x] Workshop request UI remains visually and semantically separate from active and disabled entries.
- [x] Workshop request rows do not imply TAC-compatible or active spawnable membership.
- [x] Request persistence handles duplicate Workshop items predictably.
- [x] Tests verify request persistence and no writes to the TAC Local Population Folder.
- [x] Existing Workshop Tech Candidate scanning still uses subscribed Workshop items tagged `Techs` and excludes items tagged `Mods`.

## Blocked by

- .scratch/population-pool/issues/01-population-pool-scanner.md

