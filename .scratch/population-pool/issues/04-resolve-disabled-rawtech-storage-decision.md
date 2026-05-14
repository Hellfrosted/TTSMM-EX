# Resolve Disabled RawTech Storage Decision

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Resolve where Disabled Population Entry files live when a stable Active Population Entry is disabled. The decision must preserve TACtical_AI's active `Raw Techs/Enemies/eLocal` folder as the source of truth while keeping disabled entries recoverable and clearly outside active spawnable membership.

Capture the decision in the appropriate project documentation before implementation work depends on it.

## Acceptance criteria

- [x] The disabled RawTech storage location is explicitly chosen.
- [x] The decision explains how disabled files remain recoverable without appearing as Active Population Entries.
- [x] The decision explains how the location relates to TACtical_AI's `Raw Techs/Enemies/eLocal` folder.
- [x] The decision covers duplicate filenames, missing folders, and user-created Tech data recovery expectations at a product level.
- [x] Relevant docs are updated so implementation agents have a single source of truth.

## Blocked by

- .scratch/population-pool/issues/03-population-path-status.md

