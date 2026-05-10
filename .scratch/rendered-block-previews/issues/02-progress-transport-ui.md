# Rendered Block Previews Slice 02: Progress Transport/UI

Status: complete

## Goal

Block Lookup index builds report determinate progress with phase labels while the build is running.

## Acceptance

- [x] Main process emits typed Block Lookup build progress events during indexing.
- [x] Renderer subscribes to Block Lookup progress events only through the electron API contract.
- [x] The Block Lookup run status shows an accessible progress bar with percent and phase label.
- [x] Progress state is ignored after the build has stopped.
- [x] Focused renderer/workspace/main IPC coverage verifies the progress path.
