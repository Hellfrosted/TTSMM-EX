# ADR 0011: Workshop Inventory Expansion Owns Workshop Scan Policy

## Status

Accepted

Last reviewed: 2026-05-14

## Context

Workshop inventory scans start from subscribed Workshop items and explicitly known Workshop mods, hydrate Steamworks UGC metadata into mod records, ingest Workshop Dependency Snapshots, expand missing Workshop dependencies, report progress, and return unresolved Workshop items for diagnostics.

ADR-0005 makes Steamworks UGC metadata the authority for Workshop Dependency Snapshots. That still leaves the scan policy spread across the scan loop, dependency snapshot ingestion, resolver state, duplicate handling, unresolved item tracking, and platform-specific scan paths. When those decisions are split, callers and adapters must know too much about ordering: when dependency expansion extends the progress total, when unknown dependency metadata should be preserved, when a known Workshop item may remain metadata-only, and which duplicate record should win.

## Decision

The main process will model Workshop Inventory Expansion as a shared workflow module.

Workshop Inventory Expansion owns:

- subscribed Workshop item interpretation
- known Workshop mod inclusion
- recursive missing Workshop dependency expansion
- Workshop Dependency Snapshot ingestion and application
- duplicate preference policy
- unresolved Workshop item reason assignment
- dependency scan stats
- progress effect requests

Platform differences are adapters, not separate policy. Linux may feed one synthetic subscribed page based on `Steamworks.getSubscribedItems()` and a details map. Windows may feed real paged Steam subscribed results. Both feed the same Workshop Inventory Expansion events.

The workflow interface receives inventory observations and returns the next workflow state plus effect requests. It does not call Steamworks, hydrate local files, mutate progress objects, log through Electron transports, or send IPC directly.

Effect requests include actions such as:

- fetch a subscribed page
- fetch Workshop details for a set of Workshop IDs
- hydrate Workshop details
- set the Workshop progress total
- increment the Workshop progress total
- increment loaded Workshop progress
- finish with the Workshop inventory outcome

Workshop Dependency Snapshot helper shapes may remain in shared code, but the scan-time policy for ingesting snapshots and applying known, known-empty, unknown, or failed results belongs inside Workshop Inventory Expansion.

The public unresolved Workshop item outcome remains flat:

- Workshop ID
- reason

The workflow may track richer internal provenance, such as whether an item came from subscribed inventory, known Workshop mods, or dependency expansion. That provenance is not exposed until callers need it.

Duplicate handling prefers the best record instead of first-wins:

- installed hydrated Workshop mods win over metadata-only potential mods
- subscribed and known sources win over dependency sources when quality is equivalent
- known Workshop mod sources win over dependency sources when quality is equivalent
- equivalent duplicates keep the existing record and mark the discarded item as duplicate

Metadata-only potential mods count as resolved inventory for known Workshop mods and dependency Workshop mods. Subscribed-only metadata items must still pass the existing valid Workshop mod checks before entering resolved inventory.

## Consequences

- Workshop inventory scan policy has one main-process home with a small effect-request interface.
- Dependency expansion and progress accounting can be tested without Steamworks or filesystem adapters.
- Linux and Windows scans use the same policy despite different Steamworks paging adapters.
- ADR-0005 behavior stays local to the scan workflow instead of being split between scan, snapshot, and validation code.
- The public unresolved item interface stays narrow while preserving a path to richer diagnostics later.
