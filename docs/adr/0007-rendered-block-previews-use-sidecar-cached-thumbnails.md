# Rendered Block Previews Use Sidecar Cached Thumbnails

## Status

Accepted

Last reviewed: 2026-05-07

## Context

Block Lookup needs block previews that look like individual TerraTech blocks, not generated approximations or Steam Workshop/mod preview images. ADR-0004 established a Rust sidecar for Unity bundle parsing with a TextAsset-only contract and unchanged persisted index shape, but Rendered Block Previews require real block asset sourcing across Workshop bundles, Nuterra JSON-adjacent assets, and vanilla TerraTech assets.

## Decision

Rendered Block Previews are an opt-in Block Lookup indexing feature owned by the Rust sidecar for asset extraction and thumbnail rendering. The app stores cached thumbnail image files under user data and persists small preview references on Block Lookup records; it does not embed image blobs, meshes, textures, or material data in the JSON index. Preview extraction prefers real block thumbnail/icon assets, then mesh/material renders when enough data is available, then no preview. Missing or failed previews are non-fatal and must not fall back to generated stand-ins or unrelated Workshop/mod preview images.

The Preview table column and selected-block preview surface appear only when the current index was successfully built with Rendered Block Previews enabled. Enabling the setting requires a successful rebuild before preview surfaces appear. Block Lookup indexing must report determinate percentage progress with phase labels and completion counts for indexed blocks, rendered previews, and unavailable previews.

## Consequences

- This supersedes ADR-0004's TextAsset-only sidecar contract and unchanged Block Lookup index shape for rendered-preview builds.
- The sidecar contract and `BLOCK_LOOKUP_INDEX_VERSION` can hard-bump without migration because the project is greenfield.
- Rendered Block Previews use a dedicated image namespace separate from mod and Workshop preview images.
- Stale thumbnail cache files are pruned only after successful index builds, so failed rebuilds do not remove existing previews.
