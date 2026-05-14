# Persisted Population Table Settings

Status: done

## Parent

.scratch/population-pool/PRD.md

## What to build

Persist Population Pool table controls using the same durable view configuration behavior users already get in Mod Collections and Block Lookup. Population Pool column order, visibility, width, and compact row preference belong in `AppConfig.viewConfigs`; transient workspace state remains local to the Population Pool workspace.

## Acceptance criteria

- [x] Population Pool column order persists across app restart.
- [x] Population Pool column visibility persists across app restart.
- [x] Population Pool column width persists across app restart.
- [x] Population Pool compact row preference persists across app restart.
- [x] Population Pool table settings are stored under `AppConfig.viewConfigs`.
- [x] Shared view-config helpers own normalization, defaulting, and minimum width behavior.
- [x] Selection, source filters, search query, loading state, and warnings remain transient workspace state.
- [x] Existing Mod Collections and Block Lookup table settings behavior does not regress.

## Blocked by

- .scratch/population-pool/issues/01-population-pool-scanner.md

