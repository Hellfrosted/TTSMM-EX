# ADR 0004: Block Lookup Uses A Rust Sidecar For Unity Bundles

## Status

Accepted

Last reviewed: 2026-05-02

## Context

Block Lookup needs to read TerraTech Workshop Unity bundle files to discover Nuterra block metadata. The previous Python/UnityPy path required users or packages to provide Python modules, which is not acceptable for the EX app release shape. JavaScript Unity parser options either do not parse bundles by themselves or bring licensing constraints that do not fit this MIT app.

## Decision

Block Lookup bundle extraction uses a small Rust sidecar executable invoked by the main process. The sidecar owns Unity bundle parsing and returns a stable JSON contract containing TextAsset payloads. TypeScript remains the owner of Nuterra block parsing, Block Lookup records, SpawnBlock alias generation, indexing, persistence, and search.

The first parser backend is `io_unity`, selected because it is MIT/Apache licensed and already exposes UnityFS, serialized file, and TextAsset access. The sidecar contract does not expose `io_unity` types, so the parser backend can change without changing Block Lookup index storage or renderer behavior.

The sidecar is packaged with the app as a runtime resource. If it is unavailable during local development, the main process may fall back to best-effort embedded text scanning, but packaged builds should include the sidecar.

## Consequences

- Users do not need Python or UnityPy for Block Lookup rebuilds.
- Electron does not need to load a native Node addon for this feature.
- The Block Lookup Index persisted JSON shape stays unchanged.
- Release builds need to compile and stage the sidecar for each supported platform.
