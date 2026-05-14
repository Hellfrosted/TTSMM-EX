# Saved Tech Candidate Conversion

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Deliver saved snapshot compatibility checks and conversion affordances without presenting Saved Tech Candidates as guaranteed TAC-spawnable entries. Users can review saved TerraTech snapshots as candidates, see whether a stable add path is available, and avoid ambiguous conversion promises.

## Acceptance criteria

- [x] Saved snapshots appear as Saved Tech Candidates until compatibility is proven.
- [x] Saved Tech Candidates are not shown as Active Population Entries.
- [x] Stable add actions are disabled or clearly gated unless TAC-Compatible Population Entry data exists.
- [x] Candidate copy avoids implying guaranteed conversion from saved snapshots to TAC-compatible RawTech data.
- [x] Compatibility failures are visible without relying on color alone.
- [x] Saved candidate preview behavior continues to use the renderer-safe preview image protocol.
- [x] Tests cover compatible, incompatible, unavailable, and empty saved snapshot states.

## Blocked by

- .scratch/population-pool/issues/06-define-tac-compatible-population-entry-check.md

