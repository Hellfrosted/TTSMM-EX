Status: complete
Type: AFK

# Settings, Index, And UI Hard Gate For Rendered Block Previews

## What to build

Add the first Rendered Block Previews slice from ADR-0007: users can opt in beside Block Lookup indexing controls, index builds record whether previews were enabled, and Block Lookup only shows preview surfaces when the current index supports Rendered Block Previews. Remove generated SVG block stand-ins from the preview path.

## Acceptance criteria

- [x] Block Lookup settings include `renderedPreviewsEnabled`, defaulting off and persisting with the existing Block Lookup settings.
- [x] The Block Lookup index contract is hard-bumped; no migration is added for older indexes.
- [x] Index builds receive the rendered-preview setting and persist whether the index was built with Rendered Block Previews enabled.
- [x] When Rendered Block Previews are disabled, the Preview table column and selected-block preview surface do not render.
- [x] When Rendered Block Previews are enabled but the current index was not built with preview support, Block Lookup shows a rebuild-required state near indexing controls.
- [x] Blocks without a real rendered preview render an empty preview cell; no generated placeholder or unrelated mod/Workshop image appears.
- [x] Focused tests cover the new setting persistence, index support flag, UI gate, and generated-stand-in removal.

## Completion Notes

Completed in the current Rendered Block Previews working tree. The follow-up progress transport/UI slice is tracked separately in `02-progress-transport-ui.md`.

## References

- `CONTEXT.md`
- `docs/adr/0007-rendered-block-previews-use-sidecar-cached-thumbnails.md`
