# Steamworks Owns Workshop Dependency Snapshots

## Status

Accepted

Last reviewed: 2026-05-03

## Context

Workshop dependency IDs can be exposed by Steamworks UGC metadata as child Workshop item IDs. TTSMM-EX previously refreshed missing or stale dependency snapshots by scraping the Steam Community Workshop page's required-items HTML, which created a second source of truth and could trigger rate limits during startup scans.

## Decision

Steamworks UGC metadata is the authoritative source for Workshop Dependency Snapshots. Startup inventory scans and explicit dependency refresh actions should not scrape Steam Community HTML for required items. When Steamworks does not provide dependency IDs for a Workshop item, the app treats that as an Unknown Workshop Dependency Snapshot rather than as a known empty dependency list.

## Consequences

- Workshop dependency behavior is consistent between startup scans and explicit refreshes.
- The app avoids Steam Community page scraping and associated rate limits during metadata refresh.
- Validation must distinguish unknown dependency metadata from a known empty dependency list.
