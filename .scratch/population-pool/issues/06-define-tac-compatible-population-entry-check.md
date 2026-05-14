# Define TAC-Compatible Population Entry Check

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Define the compatibility check that allows a source file or candidate to be treated as a TAC-Compatible Population Entry. The decision must be precise enough for agents to implement stable add and conversion affordances without guessing or writing unproven RawTech files.

Capture the decision in the appropriate project documentation before implementation work depends on it.

## Acceptance criteria

- [x] The exact compatibility check for a TAC-Compatible Population Entry is documented.
- [x] The decision distinguishes TAC-Compatible Population Entries from Saved Tech Candidates and Workshop Tech Candidates.
- [x] The decision defines how compatibility failures are reported to users.
- [x] The decision explains whether compatibility can be determined from metadata, file content, conversion output, or another source of truth.
- [x] Relevant docs are updated so implementation agents have a single source of truth.

## Blocked by

- .scratch/population-pool/issues/05-active-and-disabled-rawtech-hardening.md

