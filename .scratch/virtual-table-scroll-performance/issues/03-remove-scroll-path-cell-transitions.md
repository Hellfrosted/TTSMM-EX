Status: done

# Remove Scroll Path Cell Transitions

## What to build

Remove unnecessary per-cell transitions from the virtualized Collection mod table and Block Lookup table scroll path while preserving deliberate hover, selected-row, focus, and loading states.

The goal is to keep row feedback clear without making every visible virtual cell participate in transition work during scrolling or selection changes.

## Acceptance criteria

- [ ] Virtual table cells no longer animate properties that are touched broadly during row hover, selection, or scrolling.
- [ ] Row hover, selected state, focus-visible outline, and loading veil still render correctly in both tables.
- [ ] The change is limited to the virtual table styles and does not alter unrelated table surfaces.
- [ ] The smallest relevant renderer check passes, or the issue notes explain why it could not run.

## Blocked by

- `.scratch/virtual-table-scroll-performance/issues/01-profile-mod-and-block-virtual-table-scroll.md`

## Agent notes - 2026-05-10

- Removed `transition` declarations from the virtualized row and cell selectors for Collection and Block Lookup.
- Kept hover, selected, focus-visible, and loading selectors intact; they now render state changes directly instead of animating every mounted virtual cell.
- The change is limited to `.MainCollectionVirtualRow`, `.MainCollectionVirtualCell`, `.BlockLookupVirtualRow`, and `.BlockLookupVirtualCell` styles.
- Focused renderer checks and typecheck passed from the synced Linux checkout.
