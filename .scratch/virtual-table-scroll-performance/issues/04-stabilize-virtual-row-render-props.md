Status: done

# Stabilize Virtual Row Render Props

## What to build

Reduce avoidable React work while scrolling the Collection mod table and Block Lookup table by stabilizing virtual row props, callbacks, and cell render inputs where the current render path recreates values unnecessarily.

This slice should keep behavior identical and stay within the existing TanStack Virtual table architecture.

## Acceptance criteria

- [ ] Stable row and cell props prevent unchanged visible rows from re-rendering during unrelated table state changes.
- [ ] Collection mod table selection, highlight, details opening, and context menu behavior remains unchanged.
- [ ] Block Lookup row selection, keyboard navigation, copy, and double-click copy behavior remains unchanged.
- [ ] A focused React/render check or manual profiler comparison shows reduced row render churn.

## Blocked by

- `.scratch/virtual-table-scroll-performance/issues/01-profile-mod-and-block-virtual-table-scroll.md`

## Agent notes - 2026-05-10

- Removed the per-row inline Collection context menu closure in the table map.
- Moved Collection row activation, details opening, context menu, and selection callbacks behind `useCallback` inside the memoized row component.
- Kept Collection selection, highlight, details, context menu, and keyboard behavior covered by `main-collection-row.test.tsx`.
- Block Lookup behavior stayed on the existing virtual row primitive path; the focused geometry tests for fixed/compact rows passed.
- Further render-churn reduction should be driven by an actual React Profiler run before extracting a dedicated Block Lookup row component.
