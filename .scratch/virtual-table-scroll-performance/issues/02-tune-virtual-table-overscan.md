Status: done

# Tune Virtual Table Overscan

## What to build

Reduce the Collection mod table and Block Lookup table overscan to the smallest values that keep fast scrolling, keyboard navigation, row selection, and horizontal scrolling visually stable.

Both tables already use TanStack Virtual; this slice should tune the existing virtualizer configuration rather than replacing the table implementation.

## Acceptance criteria

- [ ] Collection mod table scrolling mounts materially fewer offscreen rows while preserving smooth keyboard navigation.
- [ ] Block Lookup table scrolling mounts materially fewer offscreen rows while preserving selection, copy, and double-click behavior.
- [ ] Fast wheel scrolling and scrollbar dragging do not show blank gaps in either table.
- [ ] The smallest relevant renderer check passes, or the issue notes explain why it could not run.

## Blocked by

- `.scratch/virtual-table-scroll-performance/issues/01-profile-mod-and-block-virtual-table-scroll.md`

## Agent notes - 2026-05-10

- Added the shared `VIRTUAL_TABLE_OVERSCAN` contract in `src/renderer/virtual-table-geometry.ts`.
- Reduced both the Collection mod table and Block Lookup table from table-specific overscan values of 28 and 24 to 8.
- With the fixed 640px initial rect, mounted rows drop from about 70 to about 30 for Collection regular rows, and from about 63 to about 31 for Block Lookup regular rows.
- Focused checks passed from the synced Linux checkout:
  - `pnpm exec vitest run src/__tests__/renderer/virtual-table-geometry.test.ts src/__tests__/renderer/main-collection-row.test.tsx src/__tests__/renderer/BlockLookupView.test.tsx --testNamePattern "fixed row geometry|compact virtual row geometry|virtual-table-geometry|main-collection-row"`
  - `pnpm run typecheck`
