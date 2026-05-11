Status: resolved

Triage: enhancement, resolved in this workspace.

Resolution: existing `src/main/active-collection-transition.ts` already owns the transaction-shaped lifecycle ordering, rollback policy, and dirty draft preservation for create, switch, rename, and delete. Existing focused tests cover the requested rollback and fallback paths.

# Deepen Collection Lifecycle Transaction Handling

## What to build

Deepen collection lifecycle persistence so create, switch, rename, delete, and dirty draft preservation share one transaction-shaped Module for collection writes, Active Collection config updates, and rollback policy.

The behavior must continue to respect ADR 0001: the main process owns collection lifecycle authority, and renderer flows receive one authoritative result to apply.

## Acceptance criteria

- [x] Collection lifecycle commands still return the same user-visible success and failure result shapes for create, switch, rename, delete, and dirty draft preservation.
- [x] The transaction Module owns the ordering of collection writes, Active Collection config updates, and rollback behavior.
- [x] Tests cover config-write failure after create, rename rollback behavior, delete fallback selection, and preserved dirty drafts.
- [x] Renderer collection lifecycle callers do not gain new persistence responsibilities.

## Blocked by

None - can start immediately
