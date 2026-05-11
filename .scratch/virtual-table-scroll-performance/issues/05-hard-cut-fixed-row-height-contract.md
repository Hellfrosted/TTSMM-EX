Status: done

# Hard Cut Fixed Row Height Contract

## What to build

Make the virtualized Collection mod table and Block Lookup table own a clear fixed-row-height contract, removing unused dynamic measurement plumbing and any CSS that allows row content to create nested scrolling or unexpected height pressure.

The tables currently estimate fixed row heights. This slice should make that contract explicit so TanStack Virtual can avoid unnecessary measurement complexity and browser layout surprises.

## Acceptance criteria

- [ ] Virtualized rows in both tables have one authoritative fixed height for regular and compact modes.
- [ ] Unused row measurement props or dynamic-height plumbing are removed from the virtual row path.
- [ ] Compact Block Lookup rows do not create nested cell scrolling during vertical table scroll.
- [ ] Keyboard navigation and scroll-to-row behavior still lands on the expected rows.

## Blocked by

- `.scratch/virtual-table-scroll-performance/issues/01-profile-mod-and-block-virtual-table-scroll.md`

## Agent notes - 2026-05-10

- Added shared fixed row-height constants for Collection regular rows, Block Lookup regular rows, compact rows, and overscan.
- Both virtualizers now use `getVirtualTableRowHeight` instead of owning local height conditionals.
- Removed `measureElement` from `VirtualTableRow`, `MainCollectionVirtualRow`, and renderer tests; rows now rely on the explicit fixed-height contract.
- Existing compact Block Lookup row coverage confirms coarse pointer mode stays at 44px instead of using compact 34px rows.
- Focused renderer checks and typecheck passed from the synced Linux checkout.
