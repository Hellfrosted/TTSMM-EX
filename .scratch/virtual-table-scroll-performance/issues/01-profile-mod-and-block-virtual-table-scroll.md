Status: done

# Profile Mod And Block Virtual Table Scroll

## What to build

Capture a focused scroll-performance baseline for the Collection mod table and Block Lookup table so row virtualization work is driven by evidence instead of guesswork.

The profile should cover the current TanStack Virtual row path, visible row counts, overscan behavior, row render cost, and browser layout or paint hotspots during fast vertical scrolling.

## Acceptance criteria

- [ ] A repeatable local profiling path exists for scrolling both the Collection mod table and Block Lookup table.
- [ ] The captured notes identify whether the dominant cost is React render work, layout, paint, or event handling.
- [ ] The notes record current visible row count, overscan count, and approximate mounted row count for both tables.
- [ ] The issue comments include the recommended next ticket order based on the profile.

## Blocked by

None - can start immediately

## Agent notes - 2026-05-10

Repeatable profiling path:

1. Run the app with enough Collection and Block Lookup rows to force virtualization.
2. In DevTools console, enable local perf logs with `localStorage.setItem('ttsmm.perf', '1')`, then reload.
3. Open React Profiler and browser Performance recorder.
4. Fast wheel-scroll and scrollbar-drag the Collection mod table and Block Lookup table separately.
5. Compare `[ttsmm-perf] profiler:Collection.MainTable`, `[ttsmm-perf] profiler:BlockLookup.View`, sort/filter measurements, and browser layout/paint slices.

Static baseline before the fixes:

- Collection table: regular row height 48px, compact row height 34px, overscan 28. At the 640px initial rect this is about 14 visible rows and up to about 70 mounted rows.
- Block Lookup table: regular row height 44px, compact row height 34px, overscan 24. At the 640px initial rect this is about 15 regular visible rows or 19 compact visible rows, and up to about 63 to 67 mounted rows.
- Dominant likely cost was broad React/render plus style work from high mounted-row counts and per-cell transitions. The code path was already fixed-height by estimate, so browser dynamic row measurement was not needed.

Recommended ticket order:

1. Tune overscan.
2. Remove virtual row/cell transitions.
3. Hard-cut the fixed row-height contract and remove measurement plumbing.
4. Stabilize row render props.
5. Evaluate div/grid fallback only if profiler evidence still shows table layout as the dominant cost.
