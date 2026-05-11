# ADR 0008: Defer Effect OpenTelemetry Until Local Diagnostics Need It

## Status

Accepted

Last reviewed: 2026-05-10

## Context

TTSMM-EX has long-running local workflows such as Workshop/mod scanning and Block Lookup indexing. Effect telemetry could make those workflows easier to diagnose, but this is a desktop app that reads local game, Workshop, and user-data paths. Even local diagnostics can affect user privacy expectations if they retain file paths, Workshop IDs, mod names, error text, timings, or machine-specific environment details.

The current app already reports user-visible progress for Block Lookup indexing and logs failures through the existing local Electron logging path. There is not yet a user-facing diagnostics export workflow or a support process that needs structured traces.

## Decision

Do not adopt `@effect/opentelemetry` yet. Defer telemetry instrumentation until there is a concrete local diagnostics workflow that needs structured traces or metrics.

If telemetry is adopted later, it must be local-only by default. No exporter may send traces, metrics, logs, file paths, Workshop IDs, mod titles, hardware details, or error payloads off-device unless a future decision explicitly designs a user-controlled export path. The first eligible workflow should be Block Lookup indexing because it has determinate phases, sidecar execution, optional rendered-preview work, and existing progress events.

Future telemetry may collect only operational data needed to explain a local run: workflow name, phase names, durations, counts, expected error categories, and sanitized source kinds. Raw absolute paths, raw mod names, raw Workshop titles, raw Workshop IDs, and sidecar stdout/stderr are not telemetry fields unless a user explicitly chooses to export a diagnostic bundle. Local retention must be bounded and stored under app user data or emitted only to the existing local log.

## Consequences

- No telemetry dependency or exporter is added in this slice.
- No follow-up implementation issues are created until a concrete local diagnostics surface is selected.
- Existing progress reporting, local logs, and test coverage remain the diagnostics source of truth.
- Any future telemetry proposal must start from local-only/no-network behavior and name the exact retained fields before implementation.
