Status: ready-for-agent

# Model Steamworks Workshop Failures As Typed Effects

## What to build

Replace ad hoc Workshop scan failure handling with typed Effect failures around Steamworks Workshop paging, Workshop metadata lookup, dependency snapshot refresh, and partial chunk failures. The result should make expected recoverable failures explicit while preserving the current successful scan behavior and user-safe degradation for failed chunks.

This slice should keep Steamworks as the external boundary and avoid adding non-Steam fallback behavior.

## Acceptance criteria

- [ ] Steamworks Workshop paging and metadata lookup failures are represented as typed recoverable failures.
- [ ] Partial failures during Workshop chunk processing remain non-fatal where the current behavior treats them as non-fatal.
- [ ] Unexpected defects are not flattened into generic user-facing strings before the IPC boundary.
- [ ] Existing Workshop scan and dependency-related tests pass or are updated to assert the same behavior through typed failures.
- [ ] No alternate Workshop metadata source or scraping fallback is introduced.

## Blocked by

- `.scratch/effect-migration/issues/02-convert-workshop-inventory-entrypoint-to-effect-runtime.md`
