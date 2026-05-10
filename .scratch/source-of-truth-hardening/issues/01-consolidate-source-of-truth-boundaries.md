# Consolidate Source Of Truth Boundaries

Status: needs-triage
Owner: implementation
PRD: missing
Last updated: 2026-05-07

## Summary

Consolidate the duplicate-ownership risks identified in the Source Of Truth Hardening PRD while preserving current user-facing behavior.

## Backlog Cleanup Note

This issue is no longer cleanly ready for implementation because `.scratch/source-of-truth-hardening/PRD.md` is not present and some overlapping source-of-truth cleanup has already landed in the current working tree:

- Mod metadata scan request ownership moved to `renderer/async-cache.ts`.
- Route/current-path policy moved to `shared/app-route-policy.ts`.
- Rendered Block Preview record/count contract moved into the shared Block Lookup index contract.
- Block Lookup column persistence moved to stable `BlockLookupColumnKey` values.

The acceptance criteria below remain for triage against the missing PRD and any remaining source-of-truth hardening work.

## Acceptance Criteria

- Main collection table config normalization owns persisted column width clamping, rounding, default elision, and unknown-key cleanup.
- Renderer form helpers keep advisory validation but do not restate durable config normalization unnecessarily.
- Collection-name renderer checks remain advisory UX, with main-process Collection Lifecycle remaining authoritative for duplicate-name rejection.
- IPC schemas remain boundary guards and do not gain app config defaults or business-policy ownership.
- Block Lookup Rust sidecar JSON parser has focused contract coverage for supported and unsupported extractor output.
- NuterraSteam Beta Matching consumers continue to use the shared policy.
- Existing Mod Collections, Settings, Workshop dependency, and Block Lookup behavior remains unchanged.

## Notes

- Respect ADR 0001 for Collection Lifecycle authority.
- Respect ADR 0003 for NuterraSteam Beta Matching.
- Respect ADR 0004 for Block Lookup sidecar ownership.
- Respect ADR 0005 for Workshop Dependency Snapshot ownership.
- Do not add shims, fallbacks, or dual canonical shapes.
