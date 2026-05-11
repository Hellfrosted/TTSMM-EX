Status: done

# Evaluate Div Grid Virtual Table Body

## What to build

If profiling still shows browser table or hybrid table/flex layout cost after the lower-risk fixes, replace one virtualized table body with a pure div/grid implementation using table ARIA roles, then apply the same pattern to the other table if the result is measurably better.

This is the fallback path for eliminating layout overhead from the current table shell plus block tbody plus absolutely positioned flex row approach.

## Acceptance criteria

- [ ] The issue comments cite profiling evidence that cheaper fixes did not remove the dominant scroll cost.
- [ ] One table is converted first and compared against the current behavior before applying the pattern to the second table.
- [ ] Column sizing, sticky header behavior, horizontal scrolling, row selection, keyboard navigation, and screen-reader labels remain equivalent.
- [ ] The final implementation uses one table body strategy; no duplicate compatibility path remains.

## Blocked by

- `.scratch/virtual-table-scroll-performance/issues/02-tune-virtual-table-overscan.md`
- `.scratch/virtual-table-scroll-performance/issues/03-remove-scroll-path-cell-transitions.md`
- `.scratch/virtual-table-scroll-performance/issues/04-stabilize-virtual-row-render-props.md`
- `.scratch/virtual-table-scroll-performance/issues/05-hard-cut-fixed-row-height-contract.md`

## Agent notes - 2026-05-10

Not implemented. The lower-risk fixes removed the obvious scroll-path costs first:

- Mounted rows are materially lower after overscan changed to 8.
- Virtual row and cell state changes no longer animate across every mounted cell.
- Dynamic row measurement plumbing was removed in favor of a fixed row-height contract.

There is not yet profiling evidence that browser table layout remains the dominant scroll cost after those changes. Keeping one current table body strategy is therefore the simpler final implementation for this issue set. Reopen this only with React Profiler and browser Performance evidence showing layout cost still dominates after the completed fixes.
