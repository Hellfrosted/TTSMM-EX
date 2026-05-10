# Architecture Ownership Maxima

## Objective

Run a bounded Goal Maker audit loop over TTSMM-EX using duplicate-ownership and codebase-architecture lenses. Find high-confidence places where ownership, interfaces, or module depth can improve; complete the first safe implementation tranche if available; and leave residual work captured on the board.

## Goal Kind

`audit`

## Current Tranche

Reach the current local maximum: duplicate-ownership taxonomy completed, architecture deepening candidates ranked, at least one safe high-confidence improvement implemented when available, and a Judge or PM audit confirming whether another safe loop remains.

## Non-Negotiable Constraints

- Preserve user changes and touch only files needed for the active board task.
- Use hard cuts for greenfield code: no compatibility shims, fallbacks, or dual-path cleanup.
- Respect `CONTEXT.md` vocabulary and accepted ADRs.
- Use `pnpm` checks from the Linux checkout at `~/dev/TTSMM-EX` after syncing changes there.
- Keep Scout and Judge tasks read-only.
- Do not add dependencies or perform destructive operations without explicit owner input.

## Stop Rule

Stop when the tranche audit passes, all safe local work is blocked, or continuing would require owner input, credentials, destructive operations, dependency additions, or strategy the board cannot decide.

## Canonical Board

Machine truth lives at:

`docs/goals/architecture-ownership-maxima/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/architecture-ownership-maxima/goal.md
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Work only on the active board task.
4. Assign Scout, Judge, Worker, or PM according to the task.
5. Write a compact task receipt.
6. Update the board.
7. Select the next active task or finish with a Judge/PM audit receipt.
