Status: ready-for-agent

# Preserve Workshop Dependency Snapshot Semantics

## What to build

Verify and harden the Effect-backed Workshop inventory path against ADR-0005's dependency snapshot rules. Steamworks UGC metadata must remain the authoritative source for Workshop Dependency Snapshots, and an unknown dependency snapshot must remain distinct from a known empty dependency list.

This slice should focus on behavior visible through startup inventory scans, explicit dependency refresh actions, collection validation, and dependency display state.

## Acceptance criteria

- [ ] Steamworks remains the only authoritative source used for Workshop Dependency Snapshots.
- [ ] Unknown Workshop dependency metadata is still represented as unknown, not as known empty.
- [ ] Known empty Workshop dependency snapshots remain distinguishable from unknown snapshots.
- [ ] Collection validation still reports unknown Workshop dependencies correctly.
- [ ] Focused tests cover the Effect-backed path for unknown, known empty, and known non-empty dependency snapshot states.

## Blocked by

- `.scratch/effect-migration/issues/03-model-steamworks-workshop-failures-as-typed-effects.md`
